/**
 * Multi-tier Decision Model Spam Classifier.
 *
 * Tier 1 (Primary): Self-hosted Clef-Flash (<200ms fast inference)
 *   https://clef.create360.ai/v1/systemone
 *
 * Tier 2 (Fallback 2): Self-hosted Backup Node Clef-Flash (15s timeout to prevent thundering herd)
 *   https://clef.aiurl.tw/v1/systemone
 *
 * Tier 3 (Fallback 3): OpenAI Decisions API (gpt-6-luna)
 *   https://api.openai.com/v1/decisions
 *
 * Graceful failover: If a tier fails or times out, the next tier is tried.
 * If all tiers fail, returns null ("no opinion") so comment posting is never blocked.
 */

import { log } from "../log";
import type { SpamCheckInput, SpamVerdict } from "./index";

export type DecisionConfig = {
	primaryUrl?: string | undefined;
	fallbackUrl?: string | undefined;
	openaiApiKey?: string | undefined;
	openaiModel?: string | undefined;
	openaiUrl?: string | undefined;
	threshold?: number | undefined; // 1-100, default 70
	primaryTimeoutMs?: number | undefined;
	fallbackTimeoutMs?: number | undefined;
	openaiTimeoutMs?: number | undefined;
};

export const PRIMARY_CLEF_URL = "https://clef.create360.ai/v1/systemone";
export const FALLBACK_CLEF_URL = "https://clef.aiurl.tw/v1/systemone";
export const OPENAI_DECISIONS_URL = "https://api.openai.com/v1/decisions";

const DEFAULT_PRIMARY_TIMEOUT_MS = 3_000;
const DEFAULT_FALLBACK_TIMEOUT_MS = 15_000;
const DEFAULT_OPENAI_TIMEOUT_MS = 10_000;

const MAX_BODY_FOR_PROMPT = 2_000;

const scrubKey = (s: string, key?: string): string =>
	key ? s.split(key).join("***") : s;

export const buildClefPayload = (input: SpamCheckInput) => ({
	model: "clef-flash",
	state: {
		author: input.author_name || "Anonymous",
		first_time_commenter: input.is_first_comment,
		page: input.post_url,
		comment: input.body_md.slice(0, MAX_BODY_FOR_PROMPT),
	},
	questions: {
		spam: {
			type: "noul",
			instructions:
				"Is this blog comment spam, commercial advertising, phishing, or abusive/harmful content?",
			criteria: {
				true: "SEO link farms, drug/casino/loan promos, paid backlink injections, scam/phishing links, gibberish or AI-generated promo, fake reviews.",
				false:
					"Genuine reactions, questions, disagreement, feedback or discussion, even if poorly written, short, or off-topic.",
			},
		},
	},
});

export const buildOpenAiDecisionsPayload = (
	input: SpamCheckInput,
	model = "gpt-6-luna",
) => ({
	model,
	input: `Author: ${input.author_name || "Anonymous"}\nPage: ${input.post_url || ""}\nComment:\n${input.body_md.slice(0, MAX_BODY_FOR_PROMPT)}`,
	questions: [
		{
			type: "predicate",
			instructions:
				"This blog comment is spam, commercial advertising, phishing, or abusive/harmful content.",
		},
	],
});

const isProbability = (n: unknown): n is number =>
	typeof n === "number" && n >= 0 && n <= 1;

/**
 * Call a Clef-Flash SystemOne endpoint.
 */
export const callClef = async (
	url: string,
	input: SpamCheckInput,
	timeoutMs: number,
	tierName: string,
): Promise<{ score: number; raw: Record<string, unknown> } | null> => {
	const body = JSON.stringify(buildClefPayload(input));
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body,
		signal: AbortSignal.timeout(timeoutMs),
	});

	if (!res.ok) {
		const errSnippet = (await res.text().catch(() => "")).slice(0, 500);
		throw new Error(`HTTP ${res.status}: ${errSnippet}`);
	}

	// biome-ignore lint/suspicious/noExplicitAny: dynamically probed response
	const data = (await res.json().catch(() => null)) as any;
	const spamAns =
		data?.answers?.spam ??
		(Array.isArray(data?.answers) ? data.answers[0] : null);
	let p: number | null = null;
	if (spamAns?.type === "noul" && isProbability(spamAns.noul)) {
		p = spamAns.noul;
	} else if (spamAns?.type === "choice") {
		if (isProbability(spamAns.probabilities?.spam)) {
			p = spamAns.probabilities.spam;
		} else if (spamAns.choice === "spam") {
			p = 1.0;
		} else if (spamAns.choice === "ham") {
			p = 0.0;
		}
	} else if (isProbability(spamAns?.probability)) {
		p = spamAns.probability;
	}

	if (p === null) {
		throw new Error("unexpected response shape from Clef model");
	}

	return { score: p, raw: { tier: tierName, url, data } };
};

/**
 * Call OpenAI Decisions API.
 */
export const callOpenAiDecisions = async (
	apiKey: string,
	model: string,
	input: SpamCheckInput,
	timeoutMs: number,
	url = OPENAI_DECISIONS_URL,
): Promise<{ score: number; raw: Record<string, unknown> } | null> => {
	const body = JSON.stringify(buildOpenAiDecisionsPayload(input, model));

	const res = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${apiKey}`,
		},
		body,
		signal: AbortSignal.timeout(timeoutMs),
	});

	if (!res.ok) {
		const rawText = (await res.text().catch(() => "")).slice(0, 500);
		throw new Error(
			`OpenAI HTTP ${res.status}: ${scrubKey(rawText, apiKey)}`,
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: dynamically probed response
	const data = (await res.json().catch(() => null)) as any;
	const ans = Array.isArray(data?.answers)
		? data.answers[0]
		: data?.answers != null && typeof data.answers === "object"
			? (data.answers?.spam ?? Object.values(data.answers)[0])
			: null;
	let p: number | null = null;
	if (isProbability(ans?.probability)) {
		p = ans.probability;
	} else if (isProbability(ans?.score)) {
		p = ans.score;
	} else if (ans?.prediction === true || ans?.result === true) {
		p = 1.0;
	} else if (ans?.prediction === false || ans?.result === false) {
		p = 0.0;
	}

	if (p === null) {
		throw new Error("unexpected response shape from OpenAI decisions API");
	}

	return { score: p, raw: { tier: "openai", model, data } };
};

export const checkDecision = async (
	cfg: DecisionConfig,
	input: SpamCheckInput,
): Promise<SpamVerdict | null> => {
	const threshold = cfg.threshold ?? 70;
	const primaryUrl = cfg.primaryUrl || PRIMARY_CLEF_URL;
	const fallbackUrl = cfg.fallbackUrl || FALLBACK_CLEF_URL;
	const primaryTimeoutMs = cfg.primaryTimeoutMs ?? DEFAULT_PRIMARY_TIMEOUT_MS;
	const fallbackTimeoutMs = cfg.fallbackTimeoutMs ?? DEFAULT_FALLBACK_TIMEOUT_MS;
	const openaiTimeoutMs = cfg.openaiTimeoutMs ?? DEFAULT_OPENAI_TIMEOUT_MS;
	const openaiUrl = cfg.openaiUrl || OPENAI_DECISIONS_URL;

	// 1. Try Primary: Clef-Flash (<200ms)
	try {
		const res = await callClef(primaryUrl, input, primaryTimeoutMs, "primary");
		if (res) {
			const spam = res.score >= threshold / 100;
			return spam
				? {
						spam: true,
						reason: "decision.clef_primary",
						score: res.score,
						raw: res.raw,
					}
				: { spam: false, score: res.score, raw: res.raw };
		}
	} catch (err) {
		log.warn("decision.primary.failed", { error: String(err), url: primaryUrl });
	}

	// 2. Try Fallback 2: Clef-Flash backup node (timeout 15s)
	try {
		const res = await callClef(
			fallbackUrl,
			input,
			fallbackTimeoutMs,
			"fallback2",
		);
		if (res) {
			const spam = res.score >= threshold / 100;
			return spam
				? {
						spam: true,
						reason: "decision.clef_fallback2",
						score: res.score,
						raw: res.raw,
					}
				: { spam: false, score: res.score, raw: res.raw };
		}
	} catch (err) {
		log.warn("decision.fallback2.failed", {
			error: String(err),
			url: fallbackUrl,
		});
	}

	// 3. Try Fallback 3: OpenAI Decisions API (gpt-6-luna) if key configured
	if (cfg.openaiApiKey) {
		try {
			const res = await callOpenAiDecisions(
				cfg.openaiApiKey,
				cfg.openaiModel || "gpt-6-luna",
				input,
				openaiTimeoutMs,
				openaiUrl,
			);
			if (res) {
				const spam = res.score >= threshold / 100;
				return spam
					? {
							spam: true,
							reason: "decision.openai",
							score: res.score,
							raw: res.raw,
						}
					: { spam: false, score: res.score, raw: res.raw };
			}
		} catch (err) {
			log.warn("decision.openai.failed", {
				error: scrubKey(String(err), cfg.openaiApiKey),
			});
		}
	}

	// All tiers failed or unavailable -> graceful fallback (no opinion)
	log.warn("decision.all_failed");
	return null;
};

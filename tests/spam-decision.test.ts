import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSpam, type SpamCheckInput } from "../src/lib/spam";
import {
	buildClefPayload,
	buildOpenAiDecisionsPayload,
	checkDecision,
	FALLBACK_CLEF_URL,
	OPENAI_DECISIONS_URL,
	PRIMARY_CLEF_URL,
} from "../src/lib/spam/decision";

const input: SpamCheckInput = {
	body_md: "This is a great blog post! Check out https://example.com/promo for cheap deals",
	author_name: "SpamBot",
	author_email: "bot@example.com",
	user_agent: "Mozilla/5.0",
	post_url: "https://blog.david888.com/welcome",
	is_first_comment: true,
};

describe("Decision model payloads", () => {
	it("builds correct Clef SystemOne payload", () => {
		const payload = buildClefPayload(input);
		expect(payload).toEqual({
			model: "clef-flash",
			state: {
				author: "SpamBot",
				first_time_commenter: true,
				page: "https://blog.david888.com/welcome",
				comment: input.body_md,
			},
			questions: {
				spam: {
					type: "noul",
					instructions:
						"Is this blog comment spam, commercial advertising, phishing, or abusive/harmful content?",
					criteria: {
						true: expect.any(String),
						false: expect.any(String),
					},
				},
			},
		});
	});

	it("builds correct OpenAI Decisions API payload", () => {
		const payload = buildOpenAiDecisionsPayload(input, "gpt-6-luna");
		expect(payload).toEqual({
			model: "gpt-6-luna",
			input: expect.stringContaining("Author: SpamBot"),
			questions: [
				{
					type: "predicate",
					instructions:
						"This blog comment is spam, commercial advertising, phishing, or abusive/harmful content.",
				},
			],
		});
	});
});

describe("Decision model classifier tier failover", () => {
	const originalFetch = globalThis.fetch;
	const fetchCalls: Array<{ url: string; init?: RequestInit | undefined }> = [];

	const recordCall = (url: string, init?: RequestInit) => {
		fetchCalls.push(init ? { url, init } : { url });
	};

	beforeEach(() => {
		fetchCalls.length = 0;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("Tier 1 (Primary Clef): passes ham when probability is below threshold", async () => {
		globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			recordCall(url, init);
			return new Response(
				JSON.stringify({
					model: "clef-flash",
					answers: { spam: { type: "noul", noul: 0.15 } },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const res = await checkDecision(
			{ threshold: 70 },
			input,
		);

		expect(res).toEqual({
			spam: false,
			score: 0.15,
			raw: expect.objectContaining({ tier: "primary", url: PRIMARY_CLEF_URL }),
		});
		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0]?.url).toBe(PRIMARY_CLEF_URL);
	});

	it("Tier 1 (Primary Clef): flags spam when probability is >= threshold", async () => {
		globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			recordCall(url, init);
			return new Response(
				JSON.stringify({
					model: "clef-flash",
					answers: { spam: { type: "noul", noul: 0.88 } },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const res = await checkDecision(
			{ threshold: 70 },
			input,
		);

		expect(res).toEqual({
			spam: true,
			reason: "decision.clef_primary",
			score: 0.88,
			raw: expect.objectContaining({ tier: "primary" }),
		});
		expect(fetchCalls).toHaveLength(1);
	});

	it("Tier 2 (Fallback 2 Clef): triggers when Primary fails (HTTP 500)", async () => {
		globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			recordCall(url, init);
			if (url === PRIMARY_CLEF_URL) {
				return new Response("Internal Server Error", { status: 500 });
			}
			return new Response(
				JSON.stringify({
					model: "clef-flash",
					answers: { spam: { type: "noul", noul: 0.92 } },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const res = await checkDecision(
			{ threshold: 70 },
			input,
		);

		expect(res).toEqual({
			spam: true,
			reason: "decision.clef_fallback2",
			score: 0.92,
			raw: expect.objectContaining({ tier: "fallback2", url: FALLBACK_CLEF_URL }),
		});
		expect(fetchCalls).toHaveLength(2);
		expect(fetchCalls[0]?.url).toBe(PRIMARY_CLEF_URL);
		expect(fetchCalls[1]?.url).toBe(FALLBACK_CLEF_URL);
	});

	it("Tier 3 (Fallback 3 OpenAI): triggers when Primary & Fallback 2 fail", async () => {
		globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			recordCall(url, init);
			if (url === PRIMARY_CLEF_URL || url === FALLBACK_CLEF_URL) {
				throw new Error("Network unreachable");
			}
			return new Response(
				JSON.stringify({
					answers: [
						{
							type: "predicate",
							probability: 0.96,
						},
					],
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const res = await checkDecision(
			{
				threshold: 70,
				openaiApiKey: "test-openai-key",
				openaiModel: "gpt-6-luna",
			},
			input,
		);

		expect(res).toEqual({
			spam: true,
			reason: "decision.openai",
			score: 0.96,
			raw: expect.objectContaining({ tier: "openai", model: "gpt-6-luna" }),
		});
		expect(fetchCalls).toHaveLength(3);
		expect(fetchCalls[0]?.url).toBe(PRIMARY_CLEF_URL);
		expect(fetchCalls[1]?.url).toBe(FALLBACK_CLEF_URL);
		expect(fetchCalls[2]?.url).toBe(OPENAI_DECISIONS_URL);
		expect(fetchCalls[2]?.init?.headers).toEqual(
			expect.objectContaining({
				authorization: "Bearer test-openai-key",
			}),
		);
	});

	it("Skips OpenAI tier if openaiApiKey is not provided", async () => {
		globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			recordCall(url, init);
			throw new Error("Clef server down");
		}) as typeof fetch;

		const res = await checkDecision(
			{ threshold: 70 }, // No openaiApiKey
			input,
		);

		expect(res).toBeNull();
		expect(fetchCalls).toHaveLength(2); // Only primary and fallback2 tried
	});

	it("Returns null (fail-open / no opinion) when all tiers fail, never throws", async () => {
		globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			recordCall(url, init);
			return new Response("Service Unavailable", { status: 503 });
		}) as typeof fetch;

		const res = await checkDecision(
			{
				threshold: 70,
				openaiApiKey: "test-key",
			},
			input,
		);

		expect(res).toBeNull();
		expect(fetchCalls).toHaveLength(3);
	});

	it("Dispatches through checkSpam when SPAM_PROVIDER='decision'", async () => {
		globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
			recordCall(url, init);
			return new Response(
				JSON.stringify({
					model: "clef-flash",
					answers: { spam: { type: "noul", noul: 0.05 } },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		}) as typeof fetch;

		const res = await checkSpam(
			{
				SPAM_PROVIDER: "decision",
				CLEF_PRIMARY_URL: PRIMARY_CLEF_URL,
				CLEF_FALLBACK_URL: FALLBACK_CLEF_URL,
				OPENAI_API_KEY: "secret-key",
				OPENAI_DECISION_MODEL: "gpt-6-luna",
			},
			input,
			70,
		);

		expect(res).toEqual({
			spam: false,
			score: 0.05,
			raw: expect.objectContaining({ tier: "primary" }),
		});
	});

	it("never leaks the OpenAI API key in error logs", async () => {
		const SECRET = "sk-super-secret-key-123456";
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		globalThis.fetch = vi.fn(async (url: string) => {
			if (url === PRIMARY_CLEF_URL || url === FALLBACK_CLEF_URL) {
				throw new Error("offline");
			}
			return new Response(`Error with token ${SECRET}`, { status: 401 });
		}) as typeof fetch;

		try {
			await checkDecision(
				{
					openaiApiKey: SECRET,
				},
				input,
			);
			const logged = logSpy.mock.calls.map((c) => JSON.stringify(c)).join(" ");
			expect(logged).not.toContain(SECRET);
			expect(logged).toContain("***");
		} finally {
			logSpy.mockRestore();
		}
	});

	it("safely handles null answers without throwing TypeError", async () => {
		globalThis.fetch = vi.fn(async (url: string) => {
			if (url === PRIMARY_CLEF_URL || url === FALLBACK_CLEF_URL) {
				throw new Error("offline");
			}
			return new Response(JSON.stringify({ answers: null }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}) as typeof fetch;

		const res = await checkDecision(
			{
				openaiApiKey: "test-key",
			},
			input,
		);
		expect(res).toBeNull();
	});

	it("supports custom OpenAI endpoint URL", async () => {
		const customUrl = "https://gateway.ai.cloudflare.com/v1/test/decisions";
		globalThis.fetch = vi.fn(async (url: string) => {
			if (url === PRIMARY_CLEF_URL || url === FALLBACK_CLEF_URL) {
				throw new Error("offline");
			}
			if (url === customUrl) {
				return new Response(
					JSON.stringify({
						answers: [{ type: "predicate", probability: 0.99 }],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			throw new Error("unexpected URL " + url);
		}) as typeof fetch;

		const res = await checkDecision(
			{
				openaiApiKey: "test-key",
				openaiUrl: customUrl,
			},
			input,
		);
		expect(res).toMatchObject({
			spam: true,
			reason: "decision.openai",
			score: 0.99,
		});
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { comments } from "../src/routes/api.comments";
import { hashCommentConfirmationToken } from "../src/lib/comment-confirmation";
import { loadNumbers } from "../src/lib/settings";
import { treeCacheKey } from "../src/lib/tree-cache";
import { fireWebhook } from "../src/lib/webhook";
import { localeMiddleware } from "../src/lib/locale";
import { makeD1, makeKv } from "./helpers/admin-sqlite";
import { installMockCaches, uninstallMockCaches } from "./helpers/mock-caches";
import type { Bindings } from "../src/index";

vi.mock("../src/lib/webhook", async (importOriginal) => ({
	...(await importOriginal<typeof import("../src/lib/webhook")>()),
	fireWebhook: vi.fn(),
}));

const MIGRATIONS_DIR = join(__dirname, "../src/db/migrations");
const USER_ID = "01HUSER000000000000000000";
const SESSION_ID = "a".repeat(64);
const SLUG = "email-confirmation";

let sqlite: DatabaseSync;
let env: Record<string, unknown>;
let sent: Array<Record<string, unknown>>;
let fetchStatus: number;
let tracked: Promise<unknown>[];
let analyticsWrite: ReturnType<typeof vi.fn>;
let edgeCache: ReturnType<typeof installMockCaches>;
const execCtx = {
	waitUntil(promise: Promise<unknown>) {
		tracked.push(promise);
	},
	passThroughOnException() {},
} as unknown as ExecutionContext;

beforeEach(() => {
	edgeCache = installMockCaches();
	sent = [];
	tracked = [];
	analyticsWrite = vi.fn();
	vi.mocked(fireWebhook).mockClear();
	fetchStatus = 200;
	vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
		sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
		return new Response(fetchStatus === 200 ? "{}" : '{"name":"validation_error"}', {
			status: fetchStatus,
		});
	});
	sqlite = new DatabaseSync(":memory:");
	for (const file of readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort()) {
		sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
	}
	sqlite
		.prepare(
			`INSERT INTO users (id, provider, provider_id, name, email, is_admin, role, created_at)
			 VALUES (?, 'github', 'reader', 'Reader', 'reader@example.com', 0, 'user', ?)`,
		)
		.run(USER_ID, Date.now());
	sqlite
		.prepare("INSERT INTO posts (slug, title, url, created_at) VALUES (?, ?, ?, ?)")
		.run(SLUG, "Email comments", "https://blog.example/post", Date.now());
	env = {
		DB: makeD1(sqlite),
		TREE_CACHE: makeKv(),
		SESSIONS: {
			async get(key: string) {
				return key === `sess:${SESSION_ID}`
					? JSON.stringify({ user_id: USER_ID, expires_at: 4_102_444_800_000 })
					: null;
			},
			async put() {},
			async delete() {},
		},
		ANALYTICS: { writeDataPoint: analyticsWrite },
		ENV: "dev",
		IP_HASH_SECRET: "test-secret",
		COMMENT_EMAIL_CONFIRMATION_ENABLED: "true",
		EMAIL_PROVIDER: "resend",
		RESEND_API_KEY: "re_test",
		EMAIL_FROM: "no-reply@example.com",
		PUBLIC_BASE_URL: "https://comments.example",
		ALLOWED_ORIGINS: "https://blog.example",
		SPAM_LINK_THRESHOLD: "-1",
	};
});

afterEach(() => {
	sqlite.close();
	uninstallMockCaches();
	vi.unstubAllGlobals();
});

const addSubscription = (id: string, email: string) =>
	sqlite
		.prepare(
			`INSERT INTO subscriptions
			   (id, post_slug, email, token, created_at, unsubscribed_at, last_notified_at, confirm_token, confirmed_at, locale)
			 VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'en')`,
		)
		.run(id, SLUG, email, `${id}-token`, Date.now(), Date.now());

const countRows = (table: string) =>
	(
		sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
	).n;

const post = (
	body: Record<string, unknown>,
	extraEnv: Record<string, unknown> = {},
locale = "en",
) =>
	createApp().request(
			`/?lang=${encodeURIComponent(locale)}`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: `garrul_sess=${SESSION_ID}`,
					"cf-connecting-ip": "203.0.113.17",
				},
				body: JSON.stringify({ slug: SLUG, body: "A thoughtful comment", ...body }),
			},
			{ ...env, ...extraEnv },
			execCtx,
		);

const confirmRequest = (method: "GET" | "POST", token: string) =>
	createApp().request(
			`/confirm/${token}`,
			{ method },
			{ ...env },
			execCtx,
		);

const createApp = () => {
	const app = new Hono<{ Bindings: Bindings }>();
	app.use("*", localeMiddleware());
	app.route("/", comments);
	return app;
};

const tokenFromMail = (): string => {
	const match = String(sent[0]?.html).match(/\/comments\/confirm\/([0-9a-f]{64})/);
	if (!match?.[1]) throw new Error("confirmation token missing from email");
	return match[1];
};

const pendingCount = () =>
	(
		sqlite
			.prepare("SELECT COUNT(*) AS n FROM pending_comment_submissions")
			.get() as { n: number }
	).n;

const publicCommentCount = () =>
	(
		sqlite.prepare("SELECT COUNT(*) AS n FROM comments").get() as {
			n: number;
		}
	).n;

const commentsForTarget = () =>
	(
		sqlite
			.prepare("SELECT COUNT(*) AS n FROM comments WHERE post_slug = ?")
			.get(SLUG) as { n: number }
	).n;

const budgetSent = () =>
	(
		sqlite
			.prepare("SELECT sent FROM email_send_budget WHERE scope = 'confirm:burst'")
			.get() as { sent: number }
	).sent;

describe("POST /comments with inbox confirmation", () => {
	it("requires a valid email address before creating a draft", async () => {
		const res = await post({});
		expect(res.status).toBe(400);
		expect((await res.json() as { error: string }).error).toBe(
			"Enter a valid email address.",
		);
		expect(pendingCount()).toBe(0);
		expect(publicCommentCount()).toBe(0);
	});

	it("fails closed when outbound email is not configured", async () => {
		const res = await post(
			{ email: "reader@example.com" },
			{ RESEND_API_KEY: undefined },
		);
		expect(res.status).toBe(503);
		expect(pendingCount()).toBe(0);
		expect(budgetSent()).toBe(0);
		expect(sent).toHaveLength(0);
	});

	it("stores a private candidate and sends a normalized confirmation address", async () => {
		const res = await post({ email: "Reader@Example.COM" });
		expect(res.status).toBe(202);
		expect(await res.json()).toMatchObject({
			ok: true,
			status: "pending_confirmation",
		});
		expect(pendingCount()).toBe(1);
		expect(publicCommentCount()).toBe(0);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toEqual(["reader@example.com"]);
		expect(sent[0]?.subject).toContain("Email comments");
		expect(sent[0]?.html).toContain(
			"https://comments.example/api/v1/comments/confirm/",
		);
		expect(budgetSent()).toBe(1);
	});

	it("localizes confirmation email and its landing page in the submission locale", async () => {
		await post({ email: "reader@example.com" }, {}, "de");
		expect(sent[0]?.subject).toBe("Bestätige deinen Kommentar zu Email comments");
		const page = await confirmRequest("GET", tokenFromMail());
		const html = await page.text();
		expect(html).toContain("Diesen Kommentar für „Email comments“ bestätigen?");
		expect(html).toContain("Kommentar bestätigen und veröffentlichen");
		expect(html).toContain('href="https://blog.example/post"');
	});

	it("removes the draft and refunds the shared send reservation on provider failure", async () => {
		fetchStatus = 500;
		const res = await post({ email: "reader@example.com" });
		expect(res.status).toBe(503);
		expect(pendingCount()).toBe(0);
		expect(publicCommentCount()).toBe(0);
		expect(budgetSent()).toBe(0);
	});

	it("GET only renders the explicit confirmation action for mail scanners", async () => {
		await post({ email: "reader@example.com" });
		const token = tokenFromMail();
		const res = await confirmRequest("GET", token);
		const html = await res.text();
		expect(res.status).toBe(200);
		expect(html).toContain("Confirm and post comment");
		expect(html).toContain('<form method="post"');
		expect(publicCommentCount()).toBe(0);
		expect(pendingCount()).toBe(1);
	});

	it("promotes once after the recipient submits the confirmation form", async () => {
		await post({ email: "reader@example.com" });
		const token = tokenFromMail();
		const first = await confirmRequest("POST", token);
		const replay = await confirmRequest("POST", token);
		expect(first.status).toBe(200);
		expect(await first.text()).toContain("Your comment has been confirmed and posted.");
		expect(await replay.text()).toContain("expired or was already used");
		expect(publicCommentCount()).toBe(1);
		expect(pendingCount()).toBe(0);
	});

	it("does not promote an expired or unknown confirmation token", async () => {
		await post({ email: "reader@example.com" });
		const token = tokenFromMail();
		const tokenHash = await hashCommentConfirmationToken(token);
		sqlite
			.prepare("UPDATE pending_comment_submissions SET expires_at = ? WHERE token_hash = ?")
			.run(Date.now() - 1, tokenHash);
		const expired = await confirmRequest("POST", token);
		const unknown = await confirmRequest("POST", "f".repeat(64));
		expect(await expired.text()).toContain("expired or was already used");
		expect(await unknown.text()).toContain("expired or was already used");
		expect(publicCommentCount()).toBe(0);
	});

	it("rechecks that the thread remains open and consumes a stale candidate", async () => {
		await post({ email: "reader@example.com" });
		const token = tokenFromMail();
		sqlite.prepare("UPDATE posts SET closed = 1 WHERE slug = ?").run(SLUG);
		const res = await confirmRequest("POST", token);
		expect(await res.text()).toContain("This post no longer accepts comments");
		expect(commentsForTarget()).toBe(0);
		expect(pendingCount()).toBe(0);
	});

	it("rechecks reply targets and rejects a parent on another thread", async () => {
		await post({ email: "reader@example.com" });
		const token = tokenFromMail();
		sqlite
			.prepare("INSERT INTO posts (slug, title, url, created_at) VALUES (?, ?, ?, ?)")
			.run("other-thread", "Other", null, Date.now());
		sqlite
			.prepare(
				`INSERT INTO comments (id, post_slug, user_id, body_md, body_html, created_at, depth)
				 VALUES ('foreign-parent', 'other-thread', ?, 'parent', '<p>parent</p>', ?, 1)`,
			)
			.run(USER_ID, Date.now());
		sqlite
			.prepare("UPDATE pending_comment_submissions SET parent_id = ?, depth = 2")
			.run("foreign-parent");
		const res = await confirmRequest("POST", token);
		expect(await res.text()).toContain("reply target is no longer available");
		expect(commentsForTarget()).toBe(0);
		expect(pendingCount()).toBe(0);
	});

	it("allows only one winner when duplicate confirmation POSTs race", async () => {
		await post({ email: "reader@example.com" });
		const token = tokenFromMail();
		const responses = await Promise.all([
			confirmRequest("POST", token),
			confirmRequest("POST", token),
		]);
		const pages = await Promise.all(responses.map((response) => response.text()));
		await Promise.all(tracked);
		expect(pages.filter((html) => html.includes("Your comment has been confirmed"))).toHaveLength(1);
		expect(publicCommentCount()).toBe(1);
		expect(pendingCount()).toBe(0);
		expect(analyticsWrite).toHaveBeenCalledTimes(1);
		expect(fireWebhook).toHaveBeenCalledTimes(1);
	});

	it("runs approved-post side effects once, only after inbox confirmation", async () => {
		addSubscription("self-sub", "reader@example.com");
		addSubscription("other-sub", "other@example.com");
		await post({ email: "reader@example.com" });
		expect(analyticsWrite).not.toHaveBeenCalled();
		expect(fireWebhook).not.toHaveBeenCalled();
		expect(countRows("notifications")).toBe(0);

		const numbers = await loadNumbers(env as unknown as Bindings);
		const cachedTree = treeCacheKey(
			"http://localhost/confirm/cache-key",
			SLUG,
			"new",
			numbers.comments_per_page,
		);
		await edgeCache.put(cachedTree, new Response("cached"));
		const token = tokenFromMail();
		await confirmRequest("POST", token);
		await Promise.all(tracked);

		expect(publicCommentCount()).toBe(1);
		expect(countRows("notifications")).toBe(1);
		expect(
			sqlite.prepare("SELECT subscription_id FROM notifications").get(),
		).toEqual({ subscription_id: "other-sub" });
		expect(analyticsWrite).toHaveBeenCalledTimes(1);
		expect(analyticsWrite.mock.calls[0]?.[0].blobs).toEqual([
			"comment.posted",
			SLUG,
			"github",
			"approved",
		]);
		expect(fireWebhook).toHaveBeenCalledTimes(1);
		expect(await edgeCache.match(cachedTree)).toBeUndefined();
	});

	it("persists the spam verdict and only alerts moderators for a confirmed held comment", async () => {
		const response = await post(
			{ email: "reader@example.com" },
			{
				SPAM_PROVIDER: "workers-ai",
				AI: { run: async () => ({ response: "SPAM" }) },
				MODERATOR_EMAIL_ENABLED: "true",
			},
		);
		expect(response.status).toBe(202);
		expect(countRows("spam_verdicts")).toBe(0);
		expect(countRows("moderator_notifications")).toBe(0);
		const token = tokenFromMail();
		await confirmRequest("POST", token);
		await Promise.all(tracked);

		expect(publicCommentCount()).toBe(1);
		expect(
			sqlite.prepare("SELECT status FROM comments").get(),
		).toEqual({ status: "pending" });
		expect(countRows("spam_verdicts")).toBe(1);
		expect(countRows("moderator_notifications")).toBe(1);
		expect(countRows("notifications")).toBe(0);
		expect(analyticsWrite.mock.calls[0]?.[0].blobs[3]).toBe("pending");
	});

	it("keeps the old immediate-post path when confirmation mode is off", async () => {
		const res = await post(
			{},
			{ COMMENT_EMAIL_CONFIRMATION_ENABLED: "false" },
		);
		expect(res.status).toBe(201);
		expect(publicCommentCount()).toBe(1);
		expect(pendingCount()).toBe(0);
		expect(sent).toHaveLength(0);
	});
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { comments } from "../src/routes/api.comments";
import { installMockCaches, uninstallMockCaches } from "./helpers/mock-caches";
import type { Bindings } from "../src/index";

const MIGRATIONS_DIR = join(__dirname, "../src/db/migrations");

const makeD1 = (db: DatabaseSync): any => ({
	prepare(sql: string) {
		const stmt = db.prepare(sql);
		let bound: unknown[] = [];
		return {
			bind(...args: unknown[]) {
				bound = args;
				return this;
			},
			async run() {
				const r = stmt.run(...(bound as never[]));
				return { success: true, meta: { changes: r.changes } };
			},
			async first() {
				return stmt.get(...(bound as never[])) ?? null;
			},
			async all() {
				return { results: stmt.all(...(bound as never[])) };
			},
		};
	},
});

const makeKv = () => {
	const store = new Map<string, string>();
	return {
		async get(key: string, type?: "json") {
			const raw = store.get(key);
			if (raw == null) return null;
			return type === "json" ? JSON.parse(raw) : raw;
		},
		async put(key: string, value: string) {
			store.set(key, value);
		},
		async delete(key: string) {
			store.delete(key);
		},
	};
};

const SLUG = "avatar-post";

let sqlite: DatabaseSync;
let env: Bindings;

beforeEach(() => {
	installMockCaches();
	sqlite = new DatabaseSync(":memory:");
	for (const file of readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort()) {
		sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
	}
	sqlite
		.prepare("INSERT INTO posts (slug, title, url, created_at) VALUES (?, ?, ?, ?)")
		.run(SLUG, "Avatar Test", null, 1_700_000_000_000);
	env = {
		DB: makeD1(sqlite),
		TREE_CACHE: makeKv(),
		SESSIONS: makeKv(),
		ANALYTICS: { writeDataPoint() {} },
		ENV: "dev",
		IP_HASH_SECRET: "test-secret",
	} as unknown as Bindings;
});
afterEach(() => uninstallMockCaches());

const execCtx = {
	waitUntil() {},
	passThroughOnException() {},
} as unknown as ExecutionContext;

const post = (bodyObj: Record<string, unknown>) =>
	new Hono<{ Bindings: Bindings }>().route("/", comments).request(
		"/",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(bodyObj),
		},
		env as unknown as Record<string, unknown>,
		execCtx,
	);

describe("POST /comments — avatar_url handling", () => {
	it("accepts a valid DiceBear avatar URL and stores it on the user row", async () => {
		const avatarUrl = "https://api.dicebear.com/9.x/bottts/svg?seed=robot123";
		const res = await post({
			slug: SLUG,
			name: "Tester",
			body: "Hello with custom avatar",
			avatar_url: avatarUrl,
		});

		const json = (await res.json()) as any;
		expect(res.status).toBe(201);
		expect(json.comment.author.name).toBe("Tester");
		expect(json.comment.author.avatar_url).toBe(avatarUrl);
		expect(json.comment.author.avatar_svg).toBeNull();

		// Check database row
		const userRow = sqlite
			.prepare("SELECT * FROM users WHERE id = ?")
			.get(json.comment.author.id) as any;
		expect(userRow.avatar_url).toBe(avatarUrl);
	});

	it("ignores unsafe or non-DiceBear avatar URLs", async () => {
		const res = await post({
			slug: SLUG,
			name: "Hacker",
			body: "Trying unsafe avatar",
			avatar_url: "https://malicious.com/evil.svg",
		});

		const json = (await res.json()) as any;
		expect(res.status).toBe(201);
		expect(json.comment.author.name).toBe("Hacker");
		expect(json.comment.author.avatar_url).not.toBe("https://malicious.com/evil.svg");

		// DB row has no avatar_url
		const userRow = sqlite
			.prepare("SELECT * FROM users WHERE id = ?")
			.get(json.comment.author.id) as any;
		expect(userRow.avatar_url).toBeNull();
	});

	it("updates existing user avatar when user rerolls with a new dice avatar", async () => {
		const firstAvatar = "https://api.dicebear.com/9.x/lorelei/svg?seed=seed1";
		const res1 = await post({
			slug: SLUG,
			name: "Reroller",
			body: "First comment",
			avatar_url: firstAvatar,
		});
		expect(res1.status).toBe(201);
		const json1 = (await res1.json()) as any;
		expect(json1.comment.author.avatar_url).toBe(firstAvatar);

		const secondAvatar = "https://api.dicebear.com/9.x/adventurer/svg?seed=seed2";
		uninstallMockCaches();
		installMockCaches();
		const res2 = await post({
			slug: SLUG,
			name: "Reroller",
			body: "Second comment with rerolled avatar",
			avatar_url: secondAvatar,
		});
		expect(res2.status).toBe(201);
		const json2 = (await res2.json()) as any;
		expect(json2.comment.author.avatar_url).toBe(secondAvatar);

		// Verify database row has the updated avatar
		const userRow = sqlite
			.prepare("SELECT * FROM users WHERE id = ?")
			.get(json2.comment.author.id) as any;
		expect(userRow.avatar_url).toBe(secondAvatar);
	});

	it("does not overwrite avatar for non-anon/OAuth users", async () => {
		// Insert an existing github user
		const oauthAvatar = "https://avatars.githubusercontent.com/u/12345";
		sqlite
			.prepare(
				"INSERT INTO users (id, provider, provider_id, name, avatar_url, is_admin, is_banned, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
			)
			.run("github-user-1", "github", "gh-1", "Octocat", oauthAvatar, 1_700_000_000_000);

		const sid = "b".repeat(64);
		await env.SESSIONS.put(
			`sess:${sid}`,
			JSON.stringify({
				user_id: "github-user-1",
				issued_at: Date.now(),
				expires_at: 4_102_444_800_000,
			}),
		);

		const res = await new Hono<{ Bindings: Bindings }>().route("/", comments).request(
			"/",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: `garrul_sess=${sid}`,
				},
				body: JSON.stringify({
					slug: SLUG,
					body: "Signed in comment",
					avatar_url: "https://api.dicebear.com/9.x/bottts/svg?seed=evil",
				}),
			},
			env as unknown as Record<string, unknown>,
			execCtx,
		);

		const json = (await res.json()) as any;
		expect(res.status).toBe(201);
		// Author should retain original OAuth avatar
		expect(json.comment.author.avatar_url).toBe(oauthAvatar);

		// DB row must not be changed
		const userRow = sqlite
			.prepare("SELECT * FROM users WHERE id = ?")
			.get("github-user-1") as any;
		expect(userRow.avatar_url).toBe(oauthAvatar);
	});
});

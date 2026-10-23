import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	countPendingCommentSubmissionsForEmail,
	deleteExpiredPendingCommentSubmissions,
	getPendingCommentSubmissionByTokenHash,
	insertPendingCommentSubmission,
	PENDING_COMMENT_SUBMISSIONS_PER_EMAIL_CAP,
	promotePendingCommentSubmission,
} from "../src/db/queries";
import { makeD1 } from "./helpers/admin-sqlite";

const MIGRATIONS_DIR = join(__dirname, "../src/db/migrations");
const USER_ID = "01HUSER0000000000000000000";
const SLUG = "pending-thread";

let sqlite: DatabaseSync;
let db: ReturnType<typeof makeD1>;

beforeEach(() => {
	sqlite = new DatabaseSync(":memory:");
	for (const file of readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort()) {
		sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
	}
	db = makeD1(sqlite);
	sqlite
		.prepare(
			`INSERT INTO users (id, provider, provider_id, name, created_at)
			 VALUES (?, 'anon', NULL, 'Reader', 1000)`,
		)
		.run(USER_ID);
	sqlite
		.prepare("INSERT INTO posts (slug, title, url, created_at) VALUES (?, ?, ?, ?)")
		.run(SLUG, "Pending", "https://blog.example/pending", 1000);
});

afterEach(() => sqlite.close());

const addCandidate = (overrides: Record<string, unknown> = {}) =>
	insertPendingCommentSubmission(db, {
		post_slug: SLUG,
		parent_id: null,
		user_id: USER_ID,
		body_md: "hello",
		body_html: "<p>hello</p>",
		renderer_version: 1,
		status_after_confirm: "approved",
		ip_hash: "hashed-ip",
		user_agent: "test-agent",
		depth: 1,
		email: "reader@example.com",
		locale: "en",
		token_hash: "sha256-token-hash",
		spam_verdicts_json: "[]",
		expires_at: Date.now() + 60 * 60 * 1000,
		...overrides,
	});

describe("pending comment submissions", () => {
	it("looks up only live candidates by token hash and counts live drafts by email", async () => {
		const live = await addCandidate();
		if (!live) throw new Error("expected live candidate");
		await addCandidate({
			token_hash: "expired-hash",
			expires_at: Date.now() - 1,
		});

		expect(
			await getPendingCommentSubmissionByTokenHash(
				db,
				"sha256-token-hash",
				Date.now(),
			),
		).toMatchObject({ id: live.id, email: "reader@example.com" });
		expect(
			await getPendingCommentSubmissionByTokenHash(
				db,
				"expired-hash",
				Date.now(),
			),
		).toBeNull();
		expect(
			await countPendingCommentSubmissionsForEmail(
				db,
				"reader@example.com",
				Date.now(),
			),
		).toBe(1);
	});

	it("atomically caps live pending submissions per normalized email", async () => {
		for (let i = 0; i < PENDING_COMMENT_SUBMISSIONS_PER_EMAIL_CAP; i++) {
			await expect(addCandidate({ token_hash: `cap-${i}` })).resolves.not.toBeNull();
		}
		await expect(addCandidate({ token_hash: "over-cap" })).resolves.toBeNull();
		expect(
			await countPendingCommentSubmissionsForEmail(db, "reader@example.com"),
		).toBe(PENDING_COMMENT_SUBMISSIONS_PER_EMAIL_CAP);
	});

	it("promotes once and consumes the confirmation token", async () => {
		const candidate = await addCandidate({
			status_after_confirm: "pending",
			spam_verdicts_json: '[{"source":"heuristics","verdict":"spam"}]',
		});
		if (!candidate) throw new Error("expected candidate to insert");
		const now = Date.now();

		const promoted = await promotePendingCommentSubmission(
			db,
			"sha256-token-hash",
			now,
		);
		expect(promoted?.id).toBe(candidate.id);
		expect(
			sqlite.prepare("SELECT id, status FROM comments").all(),
		).toEqual([{ id: candidate.id, status: "pending" }]);
		expect(
			sqlite.prepare("SELECT COUNT(*) AS count FROM pending_comment_submissions").get(),
		).toEqual({ count: 0 });

		expect(
			await promotePendingCommentSubmission(
				db,
				"sha256-token-hash",
				Date.now(),
			),
		).toBeNull();
		expect(
			sqlite.prepare("SELECT COUNT(*) AS count FROM comments").get(),
		).toEqual({ count: 1 });
	});

	it("refuses promotion after expiry and removes expired drafts", async () => {
		await addCandidate({ token_hash: "expired-hash", expires_at: Date.now() - 1 });
		expect(
			await promotePendingCommentSubmission(db, "expired-hash", Date.now()),
		).toBeNull();
		expect(await deleteExpiredPendingCommentSubmissions(db, Date.now())).toBe(1);
		expect(
			sqlite.prepare("SELECT COUNT(*) AS count FROM pending_comment_submissions").get(),
		).toEqual({ count: 0 });
	});
});

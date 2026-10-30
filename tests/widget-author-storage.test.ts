import { describe, expect, it } from "vitest";
import {
	type StorageLike,
	authorStorageKey,
	clearStoredAuthor,
	getStoredAuthor,
	setStoredAuthor,
} from "../src/widget/author-storage";

const fakeStorage = (init: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } => {
	const map = new Map(Object.entries(init));
	return {
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		dump: () => Object.fromEntries(map),
	};
};

describe("authorStorageKey", () => {
	it("prefixes the key with garrul:author:", () => {
		expect(authorStorageKey("https://comments.example.com")).toBe(
			"garrul:author:https://comments.example.com",
		);
	});

	it("differs across origins", () => {
		expect(authorStorageKey("https://a.example.com")).not.toBe(
			authorStorageKey("https://b.example.com"),
		);
	});
});

describe("getStoredAuthor & setStoredAuthor", () => {
	it("returns null when key does not exist", () => {
		const s = fakeStorage();
		expect(getStoredAuthor(s, "garrul:author:test")).toBeNull();
	});

	it("saves and reads author name, email, and avatar_url with whitespace trimmed", () => {
		const s = fakeStorage();
		const key = authorStorageKey("https://example.com");

		setStoredAuthor(s, key, { name: "  Alice  " });
		expect(getStoredAuthor(s, key)).toEqual({ name: "Alice" });

		setStoredAuthor(s, key, { email: "  alice@example.com  " });
		expect(getStoredAuthor(s, key)).toEqual({
			name: "Alice",
			email: "alice@example.com",
		});

		setStoredAuthor(s, key, { avatar_url: "  https://api.dicebear.com/9.x/bottts/svg?seed=abc  " });
		expect(getStoredAuthor(s, key)).toEqual({
			name: "Alice",
			email: "alice@example.com",
			avatar_url: "https://api.dicebear.com/9.x/bottts/svg?seed=abc",
		});
	});

	it("updates existing fields and allows empty string", () => {
		const s = fakeStorage();
		const key = authorStorageKey("https://example.com");

		setStoredAuthor(s, key, { name: "Alice", email: "alice@example.com" });
		setStoredAuthor(s, key, { name: "Bob" });
		expect(getStoredAuthor(s, key)).toEqual({
			name: "Bob",
			email: "alice@example.com",
		});

		setStoredAuthor(s, key, { email: "" });
		expect(getStoredAuthor(s, key)).toEqual({
			name: "Bob",
			email: "",
		});

		setStoredAuthor(s, key, { avatar_url: "https://api.dicebear.com/9.x/lorelei/svg?seed=xyz" });
		expect(getStoredAuthor(s, key)).toEqual({
			name: "Bob",
			email: "",
			avatar_url: "https://api.dicebear.com/9.x/lorelei/svg?seed=xyz",
		});

		setStoredAuthor(s, key, { name: "", email: "", avatar_url: "" });
		expect(getStoredAuthor(s, key)).toBeNull();
		expect(s.dump()).toEqual({});
	});

	it("removes entry with clearStoredAuthor", () => {
		const s = fakeStorage();
		const key = authorStorageKey("https://example.com");

		setStoredAuthor(s, key, { name: "Alice", email: "alice@example.com" });
		expect(getStoredAuthor(s, key)).not.toBeNull();

		clearStoredAuthor(s, key);
		expect(getStoredAuthor(s, key)).toBeNull();
		expect(s.dump()).toEqual({});
	});

	it("gracefully handles invalid JSON, arrays, and primitive non-objects", () => {
		const s = fakeStorage({
			corrupt: "{broken json",
			array: JSON.stringify(["alice", "bob"]),
			primitive: JSON.stringify("plain string"),
			num: JSON.stringify(42),
			nil: JSON.stringify(null),
		});

		expect(getStoredAuthor(s, "corrupt")).toBeNull();
		expect(getStoredAuthor(s, "array")).toBeNull();
		expect(getStoredAuthor(s, "primitive")).toBeNull();
		expect(getStoredAuthor(s, "num")).toBeNull();
		expect(getStoredAuthor(s, "nil")).toBeNull();
	});

	it("gracefully handles null or undefined storage", () => {
		expect(getStoredAuthor(null, "key")).toBeNull();
		expect(getStoredAuthor(undefined, "key")).toBeNull();
		expect(() => setStoredAuthor(null, "key", { name: "Test" })).not.toThrow();
		expect(() => clearStoredAuthor(null, "key")).not.toThrow();
	});

	it("swallows throwing storage errors (e.g. quota, private browsing)", () => {
		const throwingStorage: StorageLike = {
			getItem: () => {
				throw new Error("SecurityError: storage disabled");
			},
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
			removeItem: () => {
				throw new Error("SecurityError: storage disabled");
			},
		};

		expect(() => getStoredAuthor(throwingStorage, "key")).not.toThrow();
		expect(getStoredAuthor(throwingStorage, "key")).toBeNull();
		expect(() =>
			setStoredAuthor(throwingStorage, "key", { name: "Alice" }),
		).not.toThrow();
		expect(() => clearStoredAuthor(throwingStorage, "key")).not.toThrow();
	});
});

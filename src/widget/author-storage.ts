/**
 * LocalStorage persistence for guest commenter details (name and email).
 *
 * DOM-free on purpose (tsconfig.widget.json, plain node tests). embed.ts owns
 * the DOM input wiring; this module owns the key shape, JSON serialization,
 * merging, and error resilience under blocked or throwing storage.
 *
 * Scoped by Worker origin (`garrul:author:${origin}`) so different Garrul
 * instances embedded on the same host page cannot leak or clobber each other's
 * remembered credentials.
 */

export type StorageLike = {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
};

export type StoredAuthor = {
	name?: string;
	email?: string;
	avatar_url?: string;
};

export const AUTHOR_STORAGE_PREFIX = "garrul:author:";

export const authorStorageKey = (origin: string): string =>
	`${AUTHOR_STORAGE_PREFIX}${origin}`;

/**
 * Retrieve saved author details. Returns null on any error (parse error,
 * storage throws, non-object JSON).
 */
export const getStoredAuthor = (
	storage: StorageLike | null | undefined,
	key: string,
): StoredAuthor | null => {
	if (!storage) return null;
	try {
		const raw = storage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return null;
		}
		const result: StoredAuthor = {};
		if (typeof parsed.name === "string") result.name = parsed.name;
		if (typeof parsed.email === "string") result.email = parsed.email;
		if (typeof parsed.avatar_url === "string") result.avatar_url = parsed.avatar_url;
		return result;
	} catch {
		return null;
	}
};

/**
 * Persist author details, merging with existing data. Ignores undefined fields;
 * trims and updates string values. Swallows any storage error (e.g. quota,
 * private browsing).
 */
export const setStoredAuthor = (
	storage: StorageLike | null | undefined,
	key: string,
	data: StoredAuthor,
): void => {
	if (!storage) return;
	try {
		const existing = getStoredAuthor(storage, key) ?? {};
		const next: StoredAuthor = {};
		if (data.name !== undefined) {
			next.name = typeof data.name === "string" ? data.name.trim() : "";
		} else if (existing.name !== undefined) {
			next.name = existing.name;
		}
		if (data.email !== undefined) {
			next.email = typeof data.email === "string" ? data.email.trim() : "";
		} else if (existing.email !== undefined) {
			next.email = existing.email;
		}
		if (data.avatar_url !== undefined) {
			next.avatar_url = typeof data.avatar_url === "string" ? data.avatar_url.trim() : "";
		} else if (existing.avatar_url !== undefined) {
			next.avatar_url = existing.avatar_url;
		}
		if (!next.name && !next.email && !next.avatar_url) {
			storage.removeItem(key);
			return;
		}
		storage.setItem(key, JSON.stringify(next));
	} catch {
		// swallow
	}
};

/**
 * Remove stored author details for the given key.
 */
export const clearStoredAuthor = (
	storage: StorageLike | null | undefined,
	key: string,
): void => {
	if (!storage) return;
	try {
		storage.removeItem(key);
	} catch {
		// swallow
	}
};

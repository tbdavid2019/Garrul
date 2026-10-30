/**
 * Identicon must be:
 *   - deterministic per seed (same seed → byte-identical SVG)
 *   - distinct for different seeds (overwhelmingly likely; not a hash guarantee)
 *   - symmetric on the vertical axis (the user-visible point of the design)
 */
import { describe, it, expect } from "vitest";
import { dicebearAvatarUrl, identiconSvg } from "../src/lib/identicon";

describe("identiconSvg", () => {
	it("is deterministic for the same seed", () => {
		expect(identiconSvg("abc")).toBe(identiconSvg("abc"));
	});

	it("differs across seeds", () => {
		const a = identiconSvg("01JEXAMPLEAAAAAAAAAAAAAAAA");
		const b = identiconSvg("01JEXAMPLEBBBBBBBBBBBBBBBB");
		expect(a).not.toBe(b);
	});

	it("emits a self-contained <svg> with no external refs", () => {
		const svg = identiconSvg("seed");
		expect(svg.startsWith("<svg")).toBe(true);
		expect(svg.endsWith("</svg>")).toBe(true);
		expect(svg).not.toMatch(/href=|src=|url\(/);
	});

	it("is vertically symmetric — col 0 mirrors col 4, col 1 mirrors col 3", () => {
		// Each visible cell is a <rect x="…" y="…">. Count rects at x=0 vs
		// x=4*cell — they should match (mirrors). Same for x=cell vs x=3*cell.
		const size = 50;
		const cell = size / 5;
		const svg = identiconSvg("symcheck", size);

		const countAtX = (x: number) =>
			(svg.match(new RegExp(`<rect x="${x}" `, "g")) || []).length;

		expect(countAtX(0)).toBe(countAtX(4 * cell));
		expect(countAtX(cell)).toBe(countAtX(3 * cell));
	});

	it("is marked as decorative for screen readers", () => {
		const svg = identiconSvg("seed");
		// The SVG must be marked as decorative with aria-hidden="true" (not role="img"
		// or aria-label), since the commenter's name is already in the byline beside it.
		expect(svg).toContain('aria-hidden="true"');
		expect(svg).not.toMatch(/role="img"/);
		expect(svg).not.toMatch(/aria-label/);
	});
});

describe("dicebearAvatarUrl", () => {
	it("is deterministic for the same seed and style", () => {
		expect(dicebearAvatarUrl("user-1", "lorelei")).toBe(
			dicebearAvatarUrl("user-1", "lorelei"),
		);
		expect(dicebearAvatarUrl("user-1")).toBe(dicebearAvatarUrl("user-1"));
	});

	it("differs across different seeds", () => {
		const u1 = dicebearAvatarUrl("user-1");
		const u2 = dicebearAvatarUrl("user-2");
		expect(u1).not.toBe(u2);
	});

	it("respects explicitly requested styles", () => {
		const url = dicebearAvatarUrl("user-1", "bottts");
		expect(url).toBe("https://api.dicebear.com/9.x/bottts/svg?seed=user-1");
	});

	it("encodes special characters in seed safely", () => {
		const url = dicebearAvatarUrl("user@example.com?foo=bar&baz=1", "lorelei");
		expect(url).toContain("user%40example.com%3Ffoo%3Dbar%26baz%3D1");
	});
});

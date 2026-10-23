import { describe, expect, it } from "vitest";
import { WIDGET_TABLES } from "../src/i18n/widget";
import { EN } from "../src/widget/strings";
import {
	commentConfirmationEmailField,
	commentConfirmationFailure,
	commentConfirmationOutcome,
} from "../src/widget/comment-confirmation";

const REQUIRED_WIDGET_KEYS = [
	"w.comment.confirm_email_label",
	"w.comment.confirmation_pending",
	"w.comment.confirmation_limited",
	"w.comment.confirmation_failed",
] as const;

describe("widget email confirmation", () => {
	it("requires an address for anonymous readers and prefills signed-in readers", () => {
		expect(commentConfirmationEmailField(true, null)).toEqual({
			required: true,
			value: "",
		});
		expect(commentConfirmationEmailField(true, "reader@example.com")).toEqual({
			required: true,
			value: "reader@example.com",
		});
	});

	it("keeps the legacy composer model when confirmation is disabled", () => {
		expect(commentConfirmationEmailField(false, null)).toBeNull();
		expect(commentConfirmationEmailField(false, "reader@example.com")).toBeNull();
	});

	it("treats only the 202 pending response as a confirmation request", () => {
		expect(commentConfirmationOutcome(202, "pending_confirmation")).toEqual({
			kind: "confirmation_pending",
		});
		expect(commentConfirmationOutcome(201, undefined)).toEqual({
			kind: "comment_posted",
		});
		expect(commentConfirmationOutcome(202, "other")).toEqual({ kind: "failed" });
		expect(commentConfirmationOutcome(400, undefined)).toEqual({ kind: "failed" });
	});

	it("keeps server validation copy and maps recoverable confirmation failures", () => {
		expect(commentConfirmationFailure(true, 400, undefined)).toBe("server");
		expect(commentConfirmationFailure(true, 429, "pending_limit_exceeded")).toBe("limit");
		expect(commentConfirmationFailure(true, 429, "send_budget_exhausted")).toBe("limit");
		expect(commentConfirmationFailure(true, 503, undefined)).toBe("unavailable");
		expect(commentConfirmationFailure(false, 503, undefined)).toBe("server");
	});

	it("ships all confirmation copy in every widget locale", () => {
		for (const key of REQUIRED_WIDGET_KEYS) expect(EN[key]).toBeTruthy();
		for (const [locale, table] of Object.entries(WIDGET_TABLES)) {
			for (const key of REQUIRED_WIDGET_KEYS) {
				expect(table[key], `${locale} is missing ${key}`).toBeTruthy();
			}
		}
	});
});

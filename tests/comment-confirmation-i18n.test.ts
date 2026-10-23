import { describe, expect, it } from "vitest";
import { LOCALES, TABLES } from "../src/i18n";

const REQUIRED_KEYS = [
	"err.email.invalid",
	"err.comment.confirm_unavailable",
	"ui.comment.confirm_pending",
	"ui.comment.confirm_prompt",
	"ui.comment.confirm_cta",
	"ui.comment.confirm_note",
	"ui.comment.confirmed_page",
	"ui.comment.confirmed_moderation",
	"ui.comment.link_expired",
	"ui.comment.thread_closed",
	"ui.comment.parent_unavailable",
	"ui.comment.return_to_post",
	"email.comment_confirm.subject",
	"email.comment_confirm.heading",
	"email.comment_confirm.intro",
	"email.comment_confirm.ignore",
	"email.comment_confirm.cta",
	"email.comment_confirm.paste",
] as const;

describe("comment inbox confirmation translations", () => {
	for (const locale of Object.keys(LOCALES).filter((key) => key !== "en")) {
		it(`${locale} has every confirmation email and page string`, () => {
			const table = TABLES[locale];
			for (const key of REQUIRED_KEYS) {
				expect(table?.[key], `${locale}:${key}`).toBeTypeOf("string");
			}
			expect(String(table?.["ui.comment.confirm_prompt"])).toContain("{title}");
			expect(String(table?.["email.comment_confirm.subject"])).toContain("{title}");
			expect(String(table?.["email.comment_confirm.intro"])).toContain("{title}");
		});
	}
});

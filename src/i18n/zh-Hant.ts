/**
 * Traditional Chinese server strings. Machine-seeded; awaiting native-speaker review.
 *
 * Reader-facing subscription pages, mail and feed entries are translated.
 * `err.*` is deliberately omitted so API errors continue to use the English
 * source strings. Telegram and admin surfaces are operator-facing and remain
 * English by design.
 */
import type { LocaleTable } from "./index";

export const zhHant = {
	// Server-rendered UI strings
	"ui.deleted": "[已刪除]",
	"ui.subscribe.pending": "請查看收件匣以確認訂閱。",
	"ui.subscribe.confirmed": "訂閱已確認。",

	// Subscription confirmation and unsubscribe pages
	"ui.subscribe.link_expired": "連結已過期或已使用。",
	"ui.subscribe.confirmed_page": "你已確認訂閱「{title}」的留言通知。",
	"ui.subscribe.already_unsubscribed": "你已取消訂閱「{title}」的留言通知。",
	"ui.subscribe.unsubscribed": "你已取消訂閱「{title}」的留言通知。",
	"ui.subscribe.unsubscribe_confirm": "要取消訂閱「{title}」的留言通知嗎？",
	"ui.subscribe.unsubscribe_cta": "是，取消訂閱",
	"ui.subscribe.unsubscribe_note": "尚未變更；確認前你仍會收到通知。",
	"ui.subscribe.confirm_prompt": "要開啟「{title}」的留言通知嗎？",
	"ui.subscribe.confirm_cta": "是，通知我",
	"ui.subscribe.confirm_note": "尚未變更；確認前你不會收到通知。",
	"ui.subscribe.manage_others": "此電子郵件地址也有訂閱以下討論串的通知：",
	"ui.subscribe.unsubscribe_row_cta": "取消訂閱",
	"ui.subscribe.unsubscribe_all_cta": "取消所有討論串的訂閱",
	"ui.subscribe.unsubscribed_all": "你已取消所有討論串的留言通知。",

	// Transactional email
	"email.confirm.subject": "請確認你對「{title}」留言的訂閱",
	"email.confirm.heading": "確認訂閱",
	"email.confirm.intro": "有人要求訂閱「{title}」的新留言通知，請確認此訂閱。",
	"email.confirm.ignore":
		"如果這不是你提出的要求，請忽略這封電子郵件。若未點擊下方的確認連結，我們不會再寄送此討論串的通知。",
	"email.confirm.cta": "確認訂閱",
	"email.confirm.paste": "或將此連結貼到瀏覽器中：",
	"email.digest.subject": "「{title}」有新留言",
	"email.digest.heading": { other: "「{title}」有 {count} 則新留言" },
	"email.digest.permalink": "永久連結",
	"email.digest.unsubscribe": "取消此討論串的訂閱",

	// Comment inbox confirmation
	"err.email.invalid": "請輸入有效的電子郵件地址。",
	"err.comment.confirm_unavailable":
		"目前暫時無法寄送電子郵件確認信，請稍後再試。",
	"ui.comment.confirm_pending": "請到信箱收信並確認這則留言。",
	"ui.comment.confirm_prompt": "確認要在「{title}」發布這則留言嗎？",
	"ui.comment.confirm_cta": "確認並發布留言",
	"ui.comment.confirm_note": "按下確認前，這則留言不會公開。",
	"ui.comment.confirmed_page": "留言已確認並發布。",
	"ui.comment.confirmed_moderation": "電子郵件已確認，留言正在等待管理員審核。",
	"ui.comment.link_expired": "此留言確認連結已過期或已使用。",
	"ui.comment.thread_closed": "此文章已不接受留言，因此留言未發布。",
	"ui.comment.parent_unavailable": "回覆對象已無法使用，因此留言未發布。",
	"ui.comment.return_to_post": "返回文章",
	"email.comment_confirm.subject": "請確認你在「{title}」的留言",
	"email.comment_confirm.heading": "確認留言",
	"email.comment_confirm.intro": "請確認這則發佈於「{title}」的留言是你提交的。確認後才會發布。",
	"email.comment_confirm.ignore": "如果這不是你提交的，請忽略此郵件；留言不會發布。",
	"email.comment_confirm.cta": "查看並確認留言",
	"email.comment_confirm.paste": "或在瀏覽器中開啟此連結：",

	// Atom feed
	"feed.title": "「{title}」的留言",
	"feed.entry_title": "{author} 發表了留言",
} satisfies LocaleTable;

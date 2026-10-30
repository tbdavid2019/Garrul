import type { Translator } from "../i18n";

export const COMMENT_CONFIRMATION_TTL_MS = 24 * 60 * 60 * 1000;

export const randomCommentConfirmationToken = (): string => {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const hashCommentConfirmationToken = async (
	token: string,
): Promise<string> => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

export const renderCommentConfirmationEmailHtml = (params: {
	postTitle: string;
	commentBody?: string | undefined;
	confirmUrl: string;
	locale: string;
	t: Translator;
}): string => {
	const intro = escapeHtml(
		params.t("email.comment_confirm.intro", { title: params.postTitle }),
	);
	const confirmUrl = escapeHtml(params.confirmUrl);
	const isZh = params.locale.startsWith("zh");
	const contentLabel = isZh ? "留言內容原文：" : "Your comment:";
	const commentBlock = params.commentBody
		? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #2563eb;padding:12px 16px;margin:16px 0;border-radius:6px;color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;"><div style="font-weight:600;font-size:12px;color:#64748b;margin-bottom:6px;">${contentLabel}</div>${escapeHtml(params.commentBody)}</div>`
		: "";
	return `<!doctype html><html lang="${escapeHtml(params.locale)}"><body style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111827;">
<h1 style="font-size:18px;margin:0 0 12px;">${escapeHtml(params.t("email.comment_confirm.heading"))}</h1>
<p>${intro}</p>
${commentBlock}
<p>${escapeHtml(params.t("email.comment_confirm.ignore"))}</p>
<p style="margin-top:20px;"><a href="${confirmUrl}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">${escapeHtml(params.t("email.comment_confirm.cta"))}</a></p>
<p style="margin-top:20px;font-size:12px;color:#6b7280;">${escapeHtml(params.t("email.comment_confirm.paste"))}<br>${confirmUrl}</p>
</body></html>`;
};

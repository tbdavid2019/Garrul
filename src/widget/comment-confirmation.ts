export type CommentConfirmationEmailField = {
	required: true;
	value: string;
};

export const commentConfirmationEmailField = (
	enabled: boolean,
	sessionEmail: string | null,
): CommentConfirmationEmailField | null =>
	enabled ? { required: true, value: sessionEmail ?? "" } : null;

export type CommentConfirmationOutcome =
	| { kind: "confirmation_pending" }
	| { kind: "comment_posted" }
	| { kind: "failed" };

export const commentConfirmationOutcome = (
	statusCode: number,
	status: string | undefined,
): CommentConfirmationOutcome => {
	if (statusCode === 202) {
		return status === "pending_confirmation"
			? { kind: "confirmation_pending" }
			: { kind: "failed" };
	}
	if (statusCode >= 200 && statusCode < 300) {
		return { kind: "comment_posted" };
	}
	return { kind: "failed" };
};

export const commentConfirmationFailure = (
	enabled: boolean,
	statusCode: number,
	reason: string | undefined,
): "limit" | "unavailable" | "server" => {
	if (
		enabled &&
		(reason === "pending_limit_exceeded" || reason === "send_budget_exhausted")
	) {
		return "limit";
	}
	if (enabled && statusCode === 503) return "unavailable";
	return "server";
};

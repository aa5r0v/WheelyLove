// The exact texts VerifyEmailBanner renders after a resend attempt, kept pure
// (no client imports) so tests can pin them down; "sent" must never appear for
// a failed send.
const TEXTS = {
  bg: {
    sent: "Изпратихме нов линк — провери пощата си.",
    rate: "Твърде много опити за нов линк. Изчакай около минута и опитай отново.",
    failed: "Линкът не можа да бъде изпратен. Опитай отново, а ако се повтаря — пиши ни.",
  },
  en: {
    sent: "We've sent a new link — check your inbox.",
    rate: "Too many attempts for a new link. Wait about a minute and try again.",
    failed: "The link couldn't be sent. Try again, and if it keeps failing — write to us.",
  },
} as const;

export function resendOutcomeText(ok: boolean, status?: number, locale: "bg" | "en" = "bg"): string {
  const t = TEXTS[locale];
  if (ok) return t.sent;
  if (status === 429) return t.rate;
  return t.failed;
}

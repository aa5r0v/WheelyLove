// The exact texts VerifyEmailBanner renders after a resend attempt, kept pure
// (no client imports) so tests can pin them down; "sent" must never appear for
// a failed send.
export function resendOutcomeText(ok: boolean, status?: number): string {
  if (ok) return "Изпратихме нов линк — провери пощата си.";
  if (status === 429) {
    return "Твърде много опити за нов линк. Изчакай около минута и опитай отново.";
  }
  return "Линкът не можа да бъде изпратен. Опитай отново, а ако се повтаря — пиши ни.";
}

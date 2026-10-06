// Post-login return targets ("?next="): only same-site relative paths are
// allowed. A value like "//evil.com", "/\evil.com" or "https://evil.com" would
// send the user to another origin after login, so anything but a clean "/…"
// is replaced with the schedule (the one page every flow must lead to).

import { localeHref, type AppLocale } from "./locale";

export const DEFAULT_NEXT = "/schedule";

function isSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  // "//x" and "/\x" are parsed as an authority by the browser (open redirect).
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  // Control characters (newline, tab, NUL, …) never occur in a real path.
  if (/[\x00-\x1f\x7f]/.test(value)) return false;
  return true;
}

export function safeNext(value: string | null | undefined): string {
  if (typeof value !== "string" || value === "") return DEFAULT_NEXT;
  // Decode once (the framework already decoded ?next=, but a caller may pass an
  // encoded string) and validate THE DECODED form: whatever is returned always
  // went through isSafeRelativePath, so "%2F%2Fevil.com" can never slip through.
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Malformed %-sequences stay as given; the check below still applies to them.
  }
  // Both forms must be safe; the ORIGINAL is returned so that legitimately
  // encoded query values (e.g. "?sport=a%26b") are not split apart.
  return isSafeRelativePath(value) && isSafeRelativePath(decoded) ? value : DEFAULT_NEXT;
}

// /sign-in?next=<sanitized target> — страницата за вход е на езика на
// страницата, от която идва препратката; самият next се пази непроменен.
export function signInUrl(next: string, locale: AppLocale = "bg"): string {
  return `${localeHref(locale, "/sign-in")}?next=${encodeURIComponent(safeNext(next))}`;
}

// Where the email-verification letter leads: the sign-in page (no automatic
// session - see src/lib/auth.ts), with a "confirmed" note and the way back.
export function verifiedSignInUrl(
  next: string | null | undefined,
  locale: AppLocale = "bg"
): string {
  return `${localeHref(locale, "/sign-in")}?verified=1&next=${encodeURIComponent(safeNext(next))}`;
}

// The sign-in link for a guest tapping a session button: keeps the current page
// (path + query) and marks the chosen session so the page can reopen it after login.
export function sessionSignInHref(page: string, sessionId: number | string): string {
  // Езикът се чете от самия път (/en/…), ПРЕДИ санитизацията: дори враждебен
  // next да падне към /schedule, екранът за вход остава на езика на страницата.
  const locale: AppLocale = page === "/en" || page.startsWith("/en/") ? "en" : "bg";
  const safe = safeNext(page);
  const [path, qs] = safe.split("?");
  const params = new URLSearchParams(qs ?? "");
  params.set("session", String(sessionId));
  return signInUrl(`${path}?${params.toString()}`, locale);
}

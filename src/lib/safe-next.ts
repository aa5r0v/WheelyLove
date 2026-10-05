// Post-login return targets ("?next="): only same-site relative paths are
// allowed. A value like "//evil.com", "/\evil.com" or "https://evil.com" would
// send the user to another origin after login, so anything but a clean "/…"
// is replaced with the schedule (the one page every flow must lead to).

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
  return isSafeRelativePath(decoded) ? decoded : DEFAULT_NEXT;
}

// /sign-in?next=<sanitized target>
export function signInUrl(next: string): string {
  return `/sign-in?next=${encodeURIComponent(safeNext(next))}`;
}

// The sign-in link for a guest tapping a session button: keeps the current page
// (path + query) and marks the chosen session so the page can reopen it after login.
export function sessionSignInHref(page: string, sessionId: number | string): string {
  const safe = safeNext(page);
  const [path, qs] = safe.split("?");
  const params = new URLSearchParams(qs ?? "");
  params.set("session", String(sessionId));
  return signInUrl(`${path}?${params.toString()}`);
}

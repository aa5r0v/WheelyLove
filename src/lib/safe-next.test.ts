import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT, safeNext, sessionSignInHref, signInUrl, verifiedSignInUrl } from "./safe-next";

describe("safeNext", () => {
  it("keeps clean relative paths (with query) untouched", () => {
    expect(safeNext("/schedule?d=2026-10-20&session=123")).toBe(
      "/schedule?d=2026-10-20&session=123"
    );
    expect(safeNext("/sports/spinning?session=5")).toBe("/sports/spinning?session=5");
    expect(safeNext("/my-bookings")).toBe("/my-bookings");
    expect(safeNext("/instructors/iva-ivanova?session=9")).toBe(
      "/instructors/iva-ivanova?session=9"
    );
  });

  it("falls back to /schedule for missing, empty or non-string values", () => {
    expect(safeNext(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNext(null)).toBe(DEFAULT_NEXT);
    expect(safeNext("")).toBe(DEFAULT_NEXT);
    expect(safeNext(123 as unknown as string)).toBe(DEFAULT_NEXT);
    expect(safeNext({} as unknown as string)).toBe(DEFAULT_NEXT);
  });

  it("rejects protocol-relative and backslash authority tricks", () => {
    expect(safeNext("//evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\\evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("///evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\\/evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("\\/evil.com")).toBe(DEFAULT_NEXT);
  });

  it("rejects absolute URLs and URI schemes", () => {
    expect(safeNext("https://evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("http://evil.com/x")).toBe(DEFAULT_NEXT);
    expect(safeNext("javascript:alert(1)")).toBe(DEFAULT_NEXT);
    expect(safeNext("data:text/html,x")).toBe(DEFAULT_NEXT);
    expect(safeNext("mailto:a@b.c")).toBe(DEFAULT_NEXT);
  });

  it("rejects URL-encoded variants of the same attacks", () => {
    expect(safeNext("%2F%2Fevil.com")).toBe(DEFAULT_NEXT); // //evil.com after decode
    expect(safeNext("%2F%5Cevil.com")).toBe(DEFAULT_NEXT); // /\evil.com after decode
    expect(safeNext("%5C%2Fevil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("%2F%2F%2Fevil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("https%3A%2F%2Fevil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("/%2F%2Fevil.com")).toBe(DEFAULT_NEXT); // decodes to ///evil.com
    expect(safeNext("%09/javascript:alert(1)")).toBe(DEFAULT_NEXT);
  });

  it("rejects control characters anywhere in the value", () => {
    expect(safeNext("/\n/evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\r/evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\t/evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("/schedule?d=1\n")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\x00")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\x7f")).toBe(DEFAULT_NEXT);
  });

  // Changed after the security review: the ORIGINAL value is returned (both it
  // and its decoded form must be safe), so encoded query values stay intact.
  // A fully encoded path is not a "/…" path and falls back to the default.
  it("keeps encoded query values intact instead of decoding them", () => {
    expect(safeNext("/schedule?sport=a%26b&d=2026-10-20")).toBe("/schedule?sport=a%26b&d=2026-10-20");
    expect(safeNext("%2Fschedule%3Fd%3D2026-10-20")).toBe(DEFAULT_NEXT);
  });
});

describe("verifiedSignInUrl", () => {
  it("leads the verification letter to sign-in (no automatic session) with the way back", () => {
    expect(verifiedSignInUrl("/sports/spinning?session=5")).toBe(
      "/sign-in?verified=1&next=%2Fsports%2Fspinning%3Fsession%3D5"
    );
    expect(verifiedSignInUrl("//evil.com")).toBe("/sign-in?verified=1&next=%2Fschedule");
    expect(verifiedSignInUrl(undefined)).toBe("/sign-in?verified=1&next=%2Fschedule");
  });
});

describe("signInUrl", () => {
  it("builds /sign-in?next=… with the target encoded", () => {
    expect(signInUrl("/my-bookings")).toBe(
      `/sign-in?next=${encodeURIComponent("/my-bookings")}`
    );
  });

  it("sanitizes the target it embeds", () => {
    expect(signInUrl("//evil.com")).toBe(`/sign-in?next=${encodeURIComponent(DEFAULT_NEXT)}`);
  });
});

describe("sessionSignInHref", () => {
  it("appends the chosen session to a bare page", () => {
    expect(sessionSignInHref("/sports/spinning", 123)).toBe(
      `/sign-in?next=${encodeURIComponent("/sports/spinning?session=123")}`
    );
  });

  it("keeps the existing query (the day and filters of /schedule)", () => {
    expect(sessionSignInHref("/schedule?d=2026-10-20&sport=spinning", 7)).toBe(
      `/sign-in?next=${encodeURIComponent("/schedule?d=2026-10-20&sport=spinning&session=7")}`
    );
  });

  it("replaces a stale session param instead of duplicating it", () => {
    expect(sessionSignInHref("/schedule?session=9", 7)).toBe(
      `/sign-in?next=${encodeURIComponent("/schedule?session=7")}`
    );
  });

  it("sanitizes a hostile page before embedding it", () => {
    expect(sessionSignInHref("//evil.com", 7)).toBe(
      `/sign-in?next=${encodeURIComponent(`${DEFAULT_NEXT}?session=7`)}`
    );
  });

  it("produces a next value that safeNext accepts unchanged", () => {
    const href = sessionSignInHref("/schedule?d=2026-10-20", 7);
    const next = new URL(`https://wheelylove.test${href}`).searchParams.get("next")!;
    expect(safeNext(next)).toBe(next);
  });
});

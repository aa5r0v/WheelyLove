import { describe, it, expect } from "vitest";
import { cookieLocale, localeHref, requestLocale, resolveLocale } from "./locale";
import { safeNext, sessionSignInHref, verifiedSignInUrl, DEFAULT_NEXT } from "./safe-next";

describe("resolveLocale whitelist", () => {
  it("keeps bg and en, everything else falls back to bg", () => {
    expect(resolveLocale("bg")).toBe("bg");
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("de")).toBe("bg");
    expect(resolveLocale("EN")).toBe("bg");
    expect(resolveLocale(undefined)).toBe("bg");
    expect(resolveLocale(42)).toBe("bg");
    expect(resolveLocale(null)).toBe("bg");
  });
});

describe("requestLocale", () => {
  it("the explicit x-app-locale header wins (fresh /en page without any cookie)", () => {
    const h = new Headers({ "x-app-locale": "en" });
    expect(requestLocale(h)).toBe("en");
    expect(requestLocale(new Headers())).toBe("bg");
  });

  it("a stale cookie must not override the page language sent by the form", () => {
    // direct /en visit with an old bg cookie -> the form's header wins
    expect(requestLocale(new Headers({ "x-app-locale": "en", cookie: "NEXT_LOCALE=bg" }))).toBe("en");
    // bg page with a stale en cookie -> bg wins
    expect(requestLocale(new Headers({ "x-app-locale": "bg", cookie: "NEXT_LOCALE=en" }))).toBe("bg");
  });

  it("falls back to the cookie when no header is present, bg otherwise", () => {
    expect(requestLocale(new Headers({ cookie: "NEXT_LOCALE=en" }))).toBe("en");
    expect(requestLocale(new Headers({ "x-app-locale": "de" }))).toBe("bg");
    expect(requestLocale(null)).toBe("bg");
  });
});

describe("localeHref", () => {
  it("bg keeps the path untouched, en prefixes /en", () => {
    expect(localeHref("bg", "/schedule")).toBe("/schedule");
    expect(localeHref("en", "/schedule")).toBe("/en/schedule");
    expect(localeHref("en", "/")).toBe("/en");
    expect(localeHref("bg", "/")).toBe("/");
    expect(localeHref("en", "/booking/success?s=12")).toBe("/en/booking/success?s=12");
  });
});

describe("cookieLocale", () => {
  it("reads NEXT_LOCALE only as bg/en", () => {
    expect(cookieLocale("NEXT_LOCALE=en")).toBe("en");
    expect(cookieLocale("foo=1; NEXT_LOCALE=bg; bar=2")).toBe("bg");
    expect(cookieLocale("NEXT_LOCALE=de")).toBe("bg");
    expect(cookieLocale(null)).toBe("bg");
    expect(cookieLocale(undefined)).toBe("bg");
    expect(cookieLocale("")).toBe("bg");
  });
});

describe("safeNext keeps working with locale-prefixed paths", () => {
  it("accepts /en/… return targets exactly like unprefixed ones", () => {
    expect(safeNext("/en/schedule?d=2026-10-08")).toBe("/en/schedule?d=2026-10-08");
    expect(safeNext("/en/sports/pilates?session=5")).toBe("/en/sports/pilates?session=5");
  });

  it("still blocks external redirect destinations", () => {
    expect(safeNext("//evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("/\\evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("https://evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNext("%2F%2Fevil.com")).toBe(DEFAULT_NEXT);
  });

  it("the verification letter return keeps the /en prefix (locale passed by the form)", () => {
    expect(verifiedSignInUrl("/en/my-bookings", "en")).toBe(
      "/en/sign-in?verified=1&next=%2Fen%2Fmy-bookings"
    );
    // without an explicit locale the sign-in page stays Bulgarian (default)
    expect(verifiedSignInUrl("/en/my-bookings")).toBe(
      "/sign-in?verified=1&next=%2Fen%2Fmy-bookings"
    );
  });

  it("the session sign-in link derives en from the page: the sign-in screen is English too", () => {
    expect(sessionSignInHref("/en/sports/pilates", 7)).toBe(
      "/en/sign-in?next=%2Fen%2Fsports%2Fpilates%3Fsession%3D7"
    );
    // Bulgarian pages keep the unprefixed sign-in
    expect(sessionSignInHref("/sports/pilates", 7)).toBe(
      "/sign-in?next=%2Fsports%2Fpilates%3Fsession%3D7"
    );
  });
});

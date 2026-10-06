// Самодостатъчен модул (без импорти от приложния routing): CLI скриптовете в
// slim Docker migrate образа вървят през format.ts → ./locale и нямат
// достъп до src/i18n или tsconfig alias-ите.
export const locales = ["bg", "en"] as const;
export type AppLocale = (typeof locales)[number];

export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isAppLocale(v: unknown): v is AppLocale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}

// Whitelist bg/en; всичко друго (липсваща стойност, боклук от клиента) → bg.
export function resolveLocale(v: unknown): AppLocale {
  return isAppLocale(v) ? v : "bg";
}

// BCP tag за Intl форматиране на дати/часове.
export function localeTag(locale: AppLocale): string {
  return locale === "en" ? "en-GB" : "bg-BG";
}

// Външният (URL) вид на вътрешен път: /schedule → /en/schedule само за en.
export function localeHref(locale: AppLocale, path: string): string {
  if (locale !== "en") return path;
  return path === "/" ? "/en" : `/en${path}`;
}

// Локейл от заявка: изричният x-app-locale header (пращат го формите —
// reliable сигнал и без cookie) или NEXT_LOCALE cookie-то.
export function requestLocale(headers: Headers | null | undefined): AppLocale {
  const header = headers?.get("x-app-locale");
  if (isAppLocale(header)) return header;
  return cookieLocale(headers?.get("cookie"));
}

// NEXT_LOCALE от Cookie header (само bg/en, иначе bg) — за сървърните писма.
export function cookieLocale(cookieHeader: string | null | undefined): AppLocale {
  if (!cookieHeader) return "bg";
  const m = cookieHeader.match(/(?:^|;\s*)NEXT_LOCALE=(bg|en)(?:;|$)/);
  return m ? (m[1] as AppLocale) : "bg";
}

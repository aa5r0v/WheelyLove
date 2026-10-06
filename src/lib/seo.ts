import type { AppLocale } from "./locale";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wheelylove.net";

// bg е unprefixed (каноничният корен), en живее под /en; hreflang-ите са
// взаимни, x-default води към българския вариант. Ползва се от публичните
// index-ируеми страници — споделеният layout НЕ задава canonical (всеки маршрут
// твърди себе си, не корена).
export function publicAlternates(locale: AppLocale, path: string) {
  const suffix = path === "/" ? "" : path;
  const bgUrl = `${SITE_URL}${suffix}`;
  const enUrl = `${SITE_URL}/en${suffix}`;
  return {
    canonical: locale === "en" ? enUrl : bgUrl,
    languages: { "bg-BG": bgUrl, en: enUrl, "x-default": bgUrl },
  };
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { LOCALE_COOKIE } from "@/lib/locale";

// BG/EN — запазва пътя, query-то и hash-а на текущата страница. Пише и
// NEXT_LOCALE cookie-то: от него сървърните имейли (автентикация) разбират
// езика, защото middleware-ът не го пипа (localeDetection/localeCookie: false).
export default function LanguageSwitch({ className = "" }: { className?: string }) {
  const t = useTranslations("nav");
  const current = useLocale() === "en" ? "en" : "bg";

  function go(target: "bg" | "en") {
    if (target === current) return;
    const { pathname, search, hash } = window.location;
    const stripped =
      pathname === "/en" || pathname.startsWith("/en/") ? pathname.slice(3) || "/" : pathname;
    document.cookie = `${LOCALE_COOKIE}=${target}; path=/; max-age=31536000; samesite=lax`;
    const dest = target === "en" ? (stripped === "/" ? "/en" : `/en${stripped}`) : stripped;
    // Пълно зареждане нарочно: смяната на езика трябва да пререндерира
    // html lang, metadata и сървърните компоненти с новите съобщения.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${dest}${search}${hash}`;
  }

  const item = "min-h-11 px-1 tracking-wide transition-colors";
  const active = "text-accent";
  const idle = "text-paper/60 hover:text-paper";

  return (
    <nav
      aria-label={t("language")}
      className={`flex items-center font-display text-xs font-semibold ${className}`}
    >
      <button
        type="button"
        onClick={() => go("bg")}
        aria-pressed={current === "bg"}
        className={`${item} ${current === "bg" ? active : idle}`}
      >
        BG
      </button>
      <span aria-hidden="true" className="text-paper/40">
        /
      </span>
      <button
        type="button"
        onClick={() => go("en")}
        aria-pressed={current === "en"}
        className={`${item} ${current === "en" ? active : idle}`}
      >
        EN
      </button>
    </nav>
  );
}

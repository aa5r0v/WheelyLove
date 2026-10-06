import { defineRouting } from "next-intl/routing";
import { locales } from "@/lib/locale";

// Списъкът с локейли живее в src/lib/locale.ts (самодостатъчен модул); тук
// само се преизползва, за да няма две места с една истина.
export { locales, type AppLocale } from "@/lib/locale";

export const routing = defineRouting({
  locales,
  defaultLocale: "bg",
  // Английският е само под /en; без префикс винаги е български — детерминирано,
  // без пренасочване по Accept-Language и без cookie за избора на страницата.
  localePrefix: "as-needed",
  localeDetection: false,
  // NEXT_LOCALE го пише само LanguageSwitch (избор на потребителя) и го четат
  // сървърните имейли; middleware-ът не го пипа, за да не се загуби сигналът.
  localeCookie: false,
});

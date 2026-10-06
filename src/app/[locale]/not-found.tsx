import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <p className="mt-4 text-ink/60">{t("text")}</p>
      <Link
        href="/"
        className="press font-display mt-8 inline-block bg-accent px-8 py-3 text-sm tracking-wide text-accent-ink"
      >
        {t("backHome")}
      </Link>
    </div>
  );
}

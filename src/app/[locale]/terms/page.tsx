import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { publicAlternates } from "@/lib/seo";
import { resolveLocale } from "@/lib/locale";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: "terms" });
  return {
    title: t("title"),
    alternates: publicAlternates(locale, "/terms"),
  };
}

export default async function TermsPage() {
  const t = await getTranslations("terms");
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <p className="mt-2 text-sm text-ink/50">{t("updated")}</p>

      <div className="mt-8 space-y-6 text-ink/80">
        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s1Title")}</h2>
          <p>{t("s1p1")}</p>
          <p className="text-sm italic">{t("s1p2")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s2Title")}</h2>
          <p>{t("s2p1")}</p>
          <ul className="list-disc pl-5">
            <li>{t("s2li1")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s3Title")}</h2>
          <p>{t("s3p1")}</p>
          <ul className="list-disc pl-5">
            <li>{t("s3li1")}</li>
            <li>{t("s3li2")}</li>
          </ul>
          <p>{t("s3p2")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s4Title")}</h2>
          <p>{t("s4p1")}</p>
          <p>{t("s4p2")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s5Title")}</h2>
          <p>{t("s5p1")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s6Title")}</h2>
          <p>{t("s6p1")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s7Title")}</h2>
          <p>{t("s7p1")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s8Title")}</h2>
          <p>
            {t.rich("s8p1", {
              privacyLink: (chunks) => (
                <Link href="/privacy" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s9Title")}</h2>
          <p>
            {t.rich("s9p1", {
              email: (chunks) => (
                <a href="mailto:wheelylove@abv.bg" className="underline">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </section>
      </div>
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { publicAlternates } from "@/lib/seo";
import { resolveLocale } from "@/lib/locale";

function EmailLink() {
  return (
    <a href="mailto:wheelylove@abv.bg" className="underline">
      wheelylove@abv.bg
    </a>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: "privacy" });
  return {
    title: t("title"),
    alternates: publicAlternates(locale, "/privacy"),
  };
}

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <p className="mt-2 text-sm text-ink/50">{t("updated")}</p>

      <div className="mt-8 space-y-6 text-ink/80">
        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s1Title")}</h2>
          <p>
            {t.rich("s1p1", { email: () => <EmailLink /> })}
          </p>
          <p className="text-sm italic">{t("s1p2")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s2Title")}</h2>
          <ul className="list-disc pl-5">
            <li>{t("s2li1")}</li>
            <li>{t("s2li2")}</li>
            <li>{t("s2li3")}</li>
            <li>{t("s2li4")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s3Title")}</h2>
          <ul className="list-disc pl-5">
            <li>{t("s3li1")}</li>
            <li>{t("s3li2")}</li>
            <li>{t("s3li3")}</li>
            <li>{t("s3li4")}</li>
          </ul>
          <p>{t("s3p1")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s4Title")}</h2>
          <p>{t("s4p1")}</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Resend</strong> — {t("s4li1")}
            </li>
            <li>
              <strong>Cloudflare</strong> — {t("s4li2")}
            </li>
          </ul>
          <p>{t("s4p2")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s5Title")}</h2>
          <p>{t("s5p1")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s6Title")}</h2>
          <p>{t("s6p1")}</p>
          <ul className="list-disc pl-5">
            <li>{t("s6li1")}</li>
            <li>{t("s6li2")}</li>
            <li>{t("s6li3")}</li>
            <li>{t("s6li4")}</li>
            <li>{t("s6li5")}</li>
            <li>{t("s6li6")}</li>
            <li>{t("s6li7")}</li>
          </ul>
          <p>{t.rich("s6p2", { email: () => <EmailLink /> })}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s7Title")}</h2>
          <p>{t("s7p1")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-xl text-ink">{t("s8Title")}</h2>
          <p>{t("s8p1")}</p>
        </section>
      </div>
    </div>
  );
}

import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { galleryItems } from "@/db/schema";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import GalleryGrid from "./gallery-grid";
import type { Metadata } from "next";
import { publicAlternates } from "@/lib/seo";
import { resolveLocale } from "@/lib/locale";

// Reads the DB on every request; must not be prerendered at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = resolveLocale(raw);
  const t = await getTranslations({ locale, namespace: "gallery" });
  return {
    title: t("title"),
    alternates: publicAlternates(locale, "/gallery"),
  };
}

export default async function GalleryPage() {
  const t = await getTranslations("gallery");
  const tNav = await getTranslations("nav");
  const db = getDb();
  const items = await db
    .select()
    .from(galleryItems)
    .orderBy(desc(galleryItems.createdAt));

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl">{t("title")}</h1>

      <Link
        href="/schedule"
        className="press font-display mt-6 inline-flex min-h-11 items-center bg-accent px-6 text-sm tracking-wide text-accent-ink"
      >
        {tNav("bookNow")}
      </Link>

      {items.length === 0 ? (
        <p className="mt-4 text-ink/50">{t("empty")}</p>
      ) : (
        <GalleryGrid items={items} />
      )}
    </div>
  );
}

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
    description: t("intro"),
    alternates: publicAlternates(locale, "/gallery"),
  };
}

export default async function GalleryPage() {
  const t = await getTranslations("gallery");
  const db = getDb();
  const items = await db
    .select()
    .from(galleryItems)
    .orderBy(desc(galleryItems.createdAt));
  const photos = items.filter((i) => i.type === "image").length;
  const videos = items.length - photos;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6">
      <header className="max-w-2xl">
        <p className="font-display flex items-center gap-2 text-xs tracking-[0.2em] text-ink/50">
          <span className="inline-block h-2 w-2 bg-accent" aria-hidden="true" />
          {t("eyebrow")}
        </p>
        <h1 className="font-display mt-3 text-4xl leading-none sm:text-5xl">
          {t("title")}
        </h1>
        <p className="mt-4 text-ink/70">{t("intro")}</p>
        {items.length > 0 && (
          <p className="font-display mt-4 text-xs tracking-[0.15em] text-ink/50">
            {t("countPhotos", { count: photos })}
            {videos > 0 && <> · {t("countVideos", { count: videos })}</>}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        /* Honest empty state on the brand's "no photo" block — no filler. */
        <div className="placeholder-media mt-10 flex aspect-video w-full items-center justify-center border-2 border-ink">
          <p className="bg-ink/70 px-4 py-2 text-sm text-paper/80">
            {t("empty")}
          </p>
        </div>
      ) : (
        <GalleryGrid items={items} />
      )}

      {items.length > 0 && (
        /* Quiet text link — the header keeps the primary booking CTA. */
        <p className="mt-12">
          <Link
            href="/schedule"
            className="font-display inline-flex min-h-11 items-center text-sm tracking-wide text-accent-deep underline decoration-accent/50 underline-offset-4 hover:decoration-accent"
          >
            {t("endLink")}
          </Link>
        </p>
      )}
    </div>
  );
}

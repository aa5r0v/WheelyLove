import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { galleryItems } from "@/db/schema";
import GalleryGrid from "./gallery-grid";

// Reads the DB on every request; must not be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const db = getDb();
  const items = await db
    .select()
    .from(galleryItems)
    .orderBy(desc(galleryItems.createdAt));

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl">Галерия</h1>

      <Link
        href="/schedule"
        className="press font-display mt-6 inline-flex min-h-11 items-center bg-accent px-6 text-sm tracking-wide text-accent-ink"
      >
        Запиши час
      </Link>

      {items.length === 0 ? (
        <p className="mt-4 text-ink/50">Все още няма съдържание.</p>
      ) : (
        <GalleryGrid items={items} />
      )}
    </div>
  );
}

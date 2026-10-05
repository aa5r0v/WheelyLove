import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { instructors } from "@/db/schema";

// Reads the DB on every request; must not be prerendered at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Инструктори — WheelyLove",
  description: "Запознай се с инструкторите на WheelyLove.",
};

export default async function InstructorsPage() {
  const list = await getDb().select().from(instructors).orderBy(asc(instructors.name));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="h-8 w-1.5 bg-accent" />
        <h1 className="font-display text-4xl">Инструктори</h1>
      </div>

      {list.length === 0 ? (
        <p className="mt-8 text-ink/60">Скоро тук ще видиш нашите инструктори.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((i) => (
            <li key={i.id}>
              <Link
                href={`/instructors/${i.slug}`}
                className="card-lift block min-h-11 border-l-4 border-accent bg-paper-dim"
              >
                {/* Same poster treatment as the home page sport cards. */}
                {i.photoUrl && (
                  <span className="placeholder-media relative block aspect-[3/4] overflow-hidden">
                    <Image
                      src={i.photoUrl}
                      // /uploads/ is served by nginx, not Next, so the optimizer can't fetch it.
                      unoptimized={!i.photoUrl.startsWith("/sports/")}
                      alt={i.name}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover object-top"
                    />
                  </span>
                )}
                <div className="p-5">
                  <h2 className="font-display text-2xl">{i.name}</h2>
                  {i.specialties && <p className="mt-1 text-sm text-ink/60">{i.specialties}</p>}
                  <span className="font-display mt-3 inline-block text-sm text-accent-deep">Виж визитката →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/schedule"
        className="press font-display mt-10 inline-flex min-h-11 items-center bg-accent px-6 text-sm tracking-wide text-accent-ink"
      >
        Виж графика
      </Link>
    </div>
  );
}

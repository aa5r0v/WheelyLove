import Image from "next/image";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { instructors } from "@/db/schema";
import { getInstructorUpcomingSessions, getUserSessionState, toCardData } from "@/lib/schedule";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/locale";
import ScheduleList, { type CardData } from "@/app/[locale]/schedule/schedule-list";

import type { Metadata } from "next";
import { publicAlternates } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = resolveLocale(raw);
  const db = getDb();
  const [instructor] = await db
    .select({ name: instructors.name })
    .from(instructors)
    .where(eq(instructors.slug, slug));
  if (!instructor) return {};
  const t = await getTranslations({ locale, namespace: "instructors" });
  return {
    title: `${instructor.name} — WheelyLove`,
    description: t("metaDescription"),
    alternates: publicAlternates(locale, `/instructors/${slug}`),
  };
}

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function InstructorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const locale = resolveLocale(await getLocale());
  const t = await getTranslations("instructors");
  const sp = await searchParams;
  const db = getDb();
  const [instructor] = await db
    .select()
    .from(instructors)
    .where(eq(instructors.slug, slug));

  if (!instructor) notFound();

  const now = new Date();
  const upcoming = await getInstructorUpcomingSessions(instructor.slug, now);

  const session = await getSession();
  const user = session?.user ?? null;
  const state = user
    ? await getUserSessionState(user.id, upcoming.map((s) => s.id))
    : { booked: new Set<number>(), waitlistPosition: new Map<number, number>() };

  const cards: CardData[] = upcoming.map((s) =>
    toCardData(
      s,
      {
        booked: state.booked.has(s.id),
        waitlistPosition: state.waitlistPosition.get(s.id) ?? null,
      },
      locale
    )
  );

  const grouped = new Map<string, CardData[]>();
  for (const card of cards) {
    const key = card.dateLabel;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(card);
  }

  // ?session= (sign-in return): opens that session's bottom sheet.
  const focusRaw = Number(first(sp.session));
  const focusSessionId =
    Number.isInteger(focusRaw) && focusRaw > 0 && cards.some((c) => c.id === focusRaw)
      ? focusRaw
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="grid overflow-hidden border-2 border-accent sm:grid-cols-2">
        <div className="placeholder-media relative aspect-square sm:aspect-auto">
          {instructor.photoUrl ? (
            <Image
              src={instructor.photoUrl}
              // /uploads/ is served by nginx, not Next, so the optimizer can't fetch it.
              unoptimized={!instructor.photoUrl.startsWith("/sports/")}
              alt={instructor.name}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              priority
              className="object-cover object-top"
            />
          ) : (
            <span className="absolute bottom-2 right-2 bg-ink/70 px-2 py-1 text-[10px] tracking-widest text-paper/70">
              {t("photoPlaceholder")}
            </span>
          )}
        </div>
        <div className="flex flex-col justify-center bg-ink p-8 text-paper">
          <p className="inline-block w-fit bg-accent px-2 py-1 text-xs font-semibold tracking-[0.3em] text-accent-ink">
            {instructor.specialties}
          </p>
          <h1 className="font-display mt-3 text-4xl">{instructor.name}</h1>
          <p className="mt-4 text-sm leading-relaxed text-paper/70">
            {instructor.bio}
          </p>

          <div className="mt-6 space-y-1 border-t border-accent/40 pt-4 text-sm">
            {instructor.email && (
              <p>
                <a
                  href={`mailto:${instructor.email}`}
                  className="text-paper/80 underline decoration-accent underline-offset-2 hover:text-paper"
                >
                  {instructor.email}
                </a>
              </p>
            )}
            {instructor.phone && (
              <p>
                <a
                  href={`tel:${instructor.phone}`}
                  className="text-paper/80 underline decoration-accent underline-offset-2 hover:text-paper"
                >
                  {instructor.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl">{t("upcoming")}</h2>
        {grouped.size === 0 ? (
          <div className="mt-4">
            <p className="text-ink/60">{t("noUpcoming", { name: instructor.name })}</p>
            <Link
              href="/schedule"
              className="press font-display mt-4 inline-flex min-h-11 items-center bg-accent px-6 text-sm tracking-wide text-accent-ink"
            >
              {t("viewFullSchedule")}
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-8">
              {[...grouped.entries()].map(([date, dayCards]) => (
                <div key={date}>
                  <h3 className="font-display mb-3 text-xl capitalize">{date}</h3>
                  <ScheduleList
                    cards={dayCards}
                    signedIn={!!user}
                    focusSessionId={focusSessionId}
                  />
                </div>
              ))}
            </div>
            <Link
              href={`/schedule?instructor=${encodeURIComponent(instructor.slug)}`}
              className="press font-display mt-8 inline-flex min-h-11 items-center border-2 border-ink px-6 text-sm tracking-wide transition-colors hover:bg-ink hover:text-paper"
            >
              {t("allHoursOf", { name: instructor.name })}
            </Link>
          </>
        )}
      </section>
    </div>
  );
}

import Image from "next/image";
import { and, gte, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sports } from "@/db/schema";
import { sportPosters } from "@/lib/sport-images";
import { sportName, sportDescription } from "@/lib/sport-content";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Reveal, StaggerGrid } from "@/app/reveal";
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
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
    alternates: publicAlternates(locale, "/"),
  };
}

export default async function HomePage() {
  const locale = resolveLocale(await getLocale());
  const t = await getTranslations("home");
  const tNav = await getTranslations("nav");
  const db = getDb();
  const [allSports, allInstructors, upcomingRows] = await Promise.all([
    db.select().from(sports),
    // Archived instructors are hidden everywhere, the home page cards included.
    db.select().from(instructors).where(isNull(instructors.archivedAt)),
    db
      .select({ sportId: classSessions.sportId })
      .from(classSessions)
      .where(
        and(gte(classSessions.startTime, new Date()), isNull(classSessions.cancelledAt))
      ),
  ]);
  // Sports with at least one upcoming hour keep their "see times" link; the
  // rest point straight at the (filtered) schedule instead of an empty page.
  const hasUpcoming = new Set(upcomingRows.map((r) => r.sportId));

  return (
    <div>
      <section className="relative flex min-h-[70vh] items-end overflow-hidden border-b-2 border-accent bg-ink text-paper">
        <Image
          src="/hero-community.jpg"
          alt={t("heroAlt")}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_35%] opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <Reveal className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6">
          <h1 className="font-display mt-4 text-4xl leading-[0.95] sm:text-6xl">
            {t("heroTitleLead")}{" "}
            <span className="text-accent">{t("heroTitleAccent")}</span>
          </h1>
          <p className="mt-6 max-w-md text-paper/80">{t("heroText")}</p>
          <Link
            href="#classes"
            className="press font-display mt-8 inline-block bg-accent px-8 py-3 text-sm tracking-wide text-accent-ink transition-colors hover:bg-accent-bright"
          >
            {t("heroCta")}
          </Link>
        </Reveal>
      </section>

      <section id="classes" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal className="flex items-center gap-3">
          <span className="h-8 w-1.5 bg-accent" />
          <h2 className="font-display text-3xl">{t("classesTitle")}</h2>
        </Reveal>
        <StaggerGrid className="mt-8 grid gap-6 sm:grid-cols-3">
          {allSports.map((sport) => {
            const upcoming = hasUpcoming.has(sport.id);
            return (
              <Link
                key={sport.id}
                href={upcoming ? `/sports/${sport.slug}` : `/schedule?sport=${sport.slug}`}
                className="card-lift group block border-2 border-transparent bg-ink text-paper transition-[border-color] hover:border-accent"
              >
                <div className="placeholder-media relative aspect-[3/4] w-full overflow-hidden">
                  {sportPosters[sport.slug] ? (
                    <Image
                      src={sportPosters[sport.slug]}
                      alt={sportName(sport.name, locale)}
                      fill
                      sizes="(min-width: 640px) 33vw, 100vw"
                      className="object-cover object-top"
                    />
                  ) : (
                    <span className="absolute bottom-2 right-2 bg-ink/70 px-2 py-1 text-[10px] tracking-widest text-paper/60">
                      {t("photoPlaceholder")}
                    </span>
                  )}
                </div>
                <div className="p-5">
                  <span className="inline-block h-1 w-10 bg-accent" />
                  <h3 className="font-display mt-3 text-2xl">{sportName(sport.name, locale)}</h3>
                  <p className="mt-1 text-sm text-paper/60">
                    {sportDescription(sport.description, locale)}
                  </p>
                  <span className="font-display mt-4 inline-block text-sm text-accent group-hover:underline">
                    {upcoming ? t("viewHours") : t("toSchedule")} →
                  </span>
                </div>
              </Link>
            );
          })}
        </StaggerGrid>
      </section>

      <section id="schedule" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <Reveal className="flex items-center gap-3">
          <span className="h-8 w-1.5 bg-accent" />
          <h2 className="font-display text-3xl">{t("weeklyTitle")}</h2>
        </Reveal>
        <Reveal className="mt-8">
          {/* The image previews the week, but every path leads to booking: the
              link opens the live schedule, where a spot can actually be taken. */}
          <Link href="/schedule" className="block">
            <Image
              src="/weekly-schedule.jpg"
              alt={t("scheduleImgAlt")}
              width={1536}
              height={1024}
              sizes="(min-width: 1152px) 1104px, 100vw"
              className="h-auto w-full border-2 border-ink"
            />
          </Link>
          <Link
            href="/schedule"
            className="press font-display mt-4 inline-flex min-h-11 items-center bg-accent px-8 py-3 text-sm tracking-wide text-accent-ink transition-colors hover:bg-accent-bright"
          >
            {tNav("bookNow")}
          </Link>
        </Reveal>
      </section>

      <section className="border-y-2 border-accent bg-paper-dim px-4 py-16 sm:px-6">
        <Reveal className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl">{t("instructorsTitle")}</h2>
          <p className="mt-2 max-w-lg text-ink/60">{t("instructorsText")}</p>
          {allInstructors.length > 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {allInstructors.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/instructors/${i.slug}`}
                    className="card-lift block min-h-11 border-l-4 border-accent bg-paper p-5"
                  >
                    <span className="font-display text-2xl">{i.name}</span>
                    {i.specialties && (
                      <p className="mt-1 text-sm text-ink/60">{i.specialties}</p>
                    )}
                    <span className="font-display mt-3 inline-block text-sm text-accent-deep">
                      {t("viewCard")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/instructors"
            className="press font-display mt-6 inline-block border-2 border-ink bg-accent px-6 py-2.5 text-sm tracking-wide text-accent-ink transition-colors hover:bg-ink hover:text-paper"
          >
            {t("viewAllInstructors")}
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

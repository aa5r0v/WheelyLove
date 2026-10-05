import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { instructors, sports } from "@/db/schema";
import { formatDateLong } from "@/lib/format";
import {
  getDaySessions,
  getDaysWithSessions,
  getUserSessionState,
  resolveDate,
  scheduleDates,
  toCardData,
} from "@/lib/schedule";
import ScheduleList, { type CardData } from "./schedule-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "График — WheelyLove",
  description: "Часове по дни: избери тренировка, инструктор и запиши място.",
};

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

function href(date: string, sport?: string, instructor?: string) {
  const q = new URLSearchParams({ d: date });
  if (sport) q.set("sport", sport);
  if (instructor) q.set("instructor", instructor);
  return `/schedule?${q.toString()}`;
}

// "пн" / "12" for the date strip; the date string is a Sofia calendar day, so noon UTC is safe.
function stripLabels(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("bg-BG", { timeZone: "UTC", weekday: "short" }),
    day: d.toLocaleDateString("bg-BG", { timeZone: "UTC", day: "numeric" }),
    month: d.toLocaleDateString("bg-BG", { timeZone: "UTC", month: "short" }),
  };
}

const chip =
  "inline-flex min-h-11 items-center border px-4 text-sm font-medium transition-colors";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const db = getDb();
  const [allSports, allInstructors] = await Promise.all([
    db.select({ slug: sports.slug, name: sports.name }).from(sports).orderBy(asc(sports.name)),
    db.select({ slug: instructors.slug, name: instructors.name }).from(instructors).orderBy(asc(instructors.name)),
  ]);

  // Unknown filter values are ignored rather than producing an empty page.
  const sportSlug = allSports.find((s) => s.slug === first(sp.sport))?.slug;
  const instructorSlug = allInstructors.find((i) => i.slug === first(sp.instructor))?.slug;
  const filters = { sportSlug, instructorSlug };

  const now = new Date();
  const dates = scheduleDates(now);
  const date = resolveDate(first(sp.d), now);

  const session = await getSession();
  const user = session?.user ?? null;

  const [daySessions, daysWithSessions] = await Promise.all([
    getDaySessions(date, filters, now),
    getDaysWithSessions(dates, filters, now),
  ]);
  const state = user
    ? await getUserSessionState(user.id, daySessions.map((s) => s.id))
    : { booked: new Set<number>(), waitlistPosition: new Map<number, number>() };

  const cards: CardData[] = daySessions.map((s) =>
    toCardData(s, {
      booked: state.booked.has(s.id),
      waitlistPosition: state.waitlistPosition.get(s.id) ?? null,
    })
  );

  // ?session= (sign-in return): opens that session's bottom sheet.
  const focusRaw = Number(first(sp.session));
  const focusSessionId = Number.isInteger(focusRaw) && focusRaw > 0 ? focusRaw : null;

  const hasFilter = !!(sportSlug || instructorSlug);

  return (
    <div>
      <section className="border-b-2 border-accent bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <span className="inline-block h-1.5 w-14 bg-accent" />
          <h1 className="font-display mt-3 text-4xl sm:text-5xl">График</h1>
          <p className="mt-2 max-w-lg text-sm text-paper/70">
            Избери ден, виж свободните места и запиши тренировка. Плащането е на място.
          </p>
        </div>
      </section>

      <div className="sticky top-[70px] z-30 border-b border-ink/10 bg-paper sm:top-[78px]">
        <nav aria-label="Дата" className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0 lg:grid-cols-14">
            {dates.map((d) => {
              const l = stripLabels(d);
              const selected = d === date;
              return (
                <li key={d} className="shrink-0 sm:shrink">
                  <Link
                    href={href(d, sportSlug, instructorSlug)}
                    aria-current={selected ? "date" : undefined}
                    aria-label={`${l.weekday} ${l.day} ${l.month}${daysWithSessions.has(d) ? "" : ", няма часове"}`}
                    className={`press flex min-h-14 w-14 flex-col items-center justify-center border text-center sm:w-full ${
                      selected
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-ink/20 bg-paper-dim hover:border-accent"
                    }`}
                  >
                    <span className="text-xs uppercase">{l.weekday}</span>
                    <span className="font-display text-xl leading-none">{l.day}</span>
                    <span
                      aria-hidden="true"
                      className={`mt-1 h-1 w-1 ${daysWithSessions.has(d) ? (selected ? "bg-accent-ink" : "bg-accent") : "bg-transparent"}`}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium tracking-wide text-ink/60">Тренировка</p>
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={href(date, undefined, instructorSlug)}
                  aria-current={!sportSlug ? "true" : undefined}
                  className={`${chip} ${!sportSlug ? "border-ink bg-ink text-paper" : "border-ink/30 hover:border-accent"}`}
                >
                  Всички
                </Link>
              </li>
              {allSports.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={href(date, s.slug, instructorSlug)}
                    aria-current={sportSlug === s.slug ? "true" : undefined}
                    className={`${chip} ${sportSlug === s.slug ? "border-ink bg-ink text-paper" : "border-ink/30 hover:border-accent"}`}
                  >
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {allInstructors.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium tracking-wide text-ink/60">Инструктор</p>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <Link
                    href={href(date, sportSlug)}
                    aria-current={!instructorSlug ? "true" : undefined}
                    className={`${chip} ${!instructorSlug ? "border-ink bg-ink text-paper" : "border-ink/30 hover:border-accent"}`}
                  >
                    Всички
                  </Link>
                </li>
                {allInstructors.map((i) => (
                  <li key={i.slug}>
                    <Link
                      href={href(date, sportSlug, i.slug)}
                      aria-current={instructorSlug === i.slug ? "true" : undefined}
                      className={`${chip} ${instructorSlug === i.slug ? "border-ink bg-ink text-paper" : "border-ink/30 hover:border-accent"}`}
                    >
                      {i.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasFilter && (
            <Link
              href={href(date)}
              className="inline-flex min-h-11 items-center text-sm text-accent-deep underline underline-offset-2"
            >
              Изчисти филтрите
            </Link>
          )}
        </div>

        <h2 className="font-display mt-8 text-2xl capitalize">
          {formatDateLong(new Date(`${date}T12:00:00Z`))}
        </h2>
        <div className="mt-4">
          {cards.length === 0 ? (
            <p className="border-l-4 border-ink/20 bg-paper-dim p-4 text-ink/70">
              Няма часове за този ден{hasFilter ? " с избраните филтри" : ""}. Опитай друг ден.
            </p>
          ) : (
            <ScheduleList cards={cards} signedIn={!!user} focusSessionId={focusSessionId} />
          )}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import {
  bookings,
  classSessions,
  instructors,
  sports,
  waitlistEntries,
} from "@/db/schema";
import { formatDateLong, formatPrice, formatTime } from "@/lib/format";
import BookButton from "./book-button";
import WaitlistButton from "./waitlist-button";
import { Reveal, StaggerGrid } from "@/app/reveal";
import { sportPosters } from "@/lib/sport-images";
import { LEVEL_LABELS } from "@/lib/trainings";

export default async function SportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();

  const [sport] = await db.select().from(sports).where(eq(sports.slug, slug));
  if (!sport) notFound();

  const now = new Date();
  const upcoming = await db
    .select({
      id: classSessions.id,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      capacity: classSessions.capacity,
      bookedCount: classSessions.bookedCount,
      priceCents: classSessions.priceCents,
      instructorName: instructors.name,
      instructorSlug: instructors.slug,
    })
    .from(classSessions)
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(
      and(
        eq(classSessions.sportId, sport.id),
        gte(classSessions.startTime, now),
        isNull(classSessions.cancelledAt)
      )
    )
    .orderBy(asc(classSessions.startTime));

  const session = await getSession();
  const user = session?.user ?? null;
  const sessionIds = upcoming.map((s) => s.id);
  const waitlist = sessionIds.length
    ? await db
        .select({
          sessionId: waitlistEntries.sessionId,
          userId: waitlistEntries.userId,
        })
        .from(waitlistEntries)
        .where(inArray(waitlistEntries.sessionId, sessionIds))
        .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id))
    : [];
  const myBookedSessionIds = new Set(
    user && sessionIds.length
      ? (
          await db
            .select({ sessionId: bookings.sessionId })
            .from(bookings)
            .where(
              and(
                eq(bookings.userId, user.id),
                inArray(bookings.sessionId, sessionIds),
                inArray(bookings.status, ["pending", "confirmed"])
              )
            )
        ).map((b) => b.sessionId)
      : []
  );

  function waitlistInfo(sessionId: number) {
    const queue = waitlist.filter((w) => w.sessionId === sessionId);
    const index = user ? queue.findIndex((w) => w.userId === user.id) : -1;
    return { waitingCount: queue.length, position: index === -1 ? null : index + 1 };
  }

  const grouped = new Map<string, typeof upcoming>();
  for (const session of upcoming) {
    const key = formatDateLong(session.startTime);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(session);
  }

  return (
    <div>
      <section className="relative overflow-hidden border-b-2 border-accent bg-ink text-paper">
        <div className="placeholder-media absolute inset-0 opacity-40" />
        <Reveal className="relative z-10 mx-auto flex max-w-4xl flex-col gap-8 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <span
              className="inline-block h-1.5 w-14"
              style={{ backgroundColor: sport.color }}
            />
            <h1 className="font-display mt-4 text-5xl sm:text-6xl">
              {sport.name}
            </h1>
            <p className="mt-4 max-w-lg text-paper/70">{sport.description}</p>
            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-paper/50">Ниво</dt>
                <dd>{LEVEL_LABELS[sport.level]}</dd>
              </div>
              {sport.defaultDurationMin && (
                <div>
                  <dt className="text-xs text-paper/50">Продължителност</dt>
                  <dd>{sport.defaultDurationMin} мин</dd>
                </div>
              )}
              {sport.defaultPriceCents !== null && (
                <div>
                  <dt className="text-xs text-paper/50">Цена</dt>
                  <dd>{formatPrice(sport.defaultPriceCents)}</dd>
                </div>
              )}
            </dl>
          </div>
          {sportPosters[sport.slug] && (
            <Image
              src={sportPosters[sport.slug]}
              alt={sport.name}
              width={300}
              height={450}
              priority
              className="h-auto w-44 shrink-0 border-2 border-accent sm:w-56"
            />
          )}
        </Reveal>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <Link
          href={`/schedule?sport=${sport.slug}`}
          className="font-display mb-8 inline-flex min-h-11 items-center bg-accent px-5 text-sm tracking-wide text-accent-ink"
        >
          Виж в графика →
        </Link>
        <div className="space-y-10">
          {grouped.size === 0 && (
            <p className="text-ink/50">
              Все още няма насрочени часове за тази тренировка.
            </p>
          )}
          {[...grouped.entries()].map(([date, sessionsOnDate]) => (
            <div key={date}>
              <h2 className="font-display mb-4 text-xl capitalize">{date}</h2>
              <StaggerGrid className="space-y-3">
                {sessionsOnDate.map((session) => {
                  const spotsLeft = session.capacity - session.bookedCount;
                  return (
                    <div
                      key={session.id}
                      className="card-lift flex flex-col gap-4 border-l-4 border-accent bg-paper-dim p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-display text-lg">
                          {formatTime(session.startTime)} –{" "}
                          {formatTime(session.endTime)}
                        </p>
                        <p className="mt-1 text-sm text-ink/60">
                          Треньор:{" "}
                          <Link
                            href={`/instructors/${session.instructorSlug}`}
                            className="underline decoration-accent underline-offset-2 hover:text-ink"
                          >
                            {session.instructorName}
                          </Link>
                        </p>
                        <p className="mt-1 text-sm text-ink/40">
                          {spotsLeft > 0
                            ? `${spotsLeft} свободни места`
                            : "Няма свободни места"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="font-display bg-accent px-2 py-0.5 text-lg text-accent-ink">
                          {(session.priceCents / 100).toFixed(2)} €
                        </span>
                        {myBookedSessionIds.has(session.id) ? (
                          <p className="text-sm text-green-700">Записан си</p>
                        ) : spotsLeft > 0 ? (
                          <BookButton sessionId={session.id} disabled={false} signedIn={!!user} />
                        ) : (
                          <WaitlistButton
                            sessionId={session.id}
                            signedIn={!!user}
                            {...waitlistInfo(session.id)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </StaggerGrid>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

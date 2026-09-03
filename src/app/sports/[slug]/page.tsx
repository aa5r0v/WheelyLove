import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sports } from "@/db/schema";
import { formatDateLong, formatTime } from "@/lib/format";
import BookButton from "./book-button";

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
        <div className="relative z-10 mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <span
            className="inline-block h-1.5 w-14"
            style={{ backgroundColor: sport.color }}
          />
          <h1 className="font-display mt-4 text-5xl sm:text-6xl">
            {sport.name}
          </h1>
          <p className="mt-4 max-w-lg text-paper/70">{sport.description}</p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="space-y-10">
          {grouped.size === 0 && (
            <p className="text-ink/50">
              Все още няма насрочени часове за този спорт.
            </p>
          )}
          {[...grouped.entries()].map(([date, sessionsOnDate]) => (
            <div key={date}>
              <h2 className="font-display mb-4 text-xl capitalize">{date}</h2>
              <div className="space-y-3">
                {sessionsOnDate.map((session) => {
                  const spotsLeft = session.capacity - session.bookedCount;
                  return (
                    <div
                      key={session.id}
                      className="flex items-center justify-between border-l-4 border-accent bg-paper-dim p-5"
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
                        <BookButton
                          sessionId={session.id}
                          disabled={spotsLeft <= 0}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

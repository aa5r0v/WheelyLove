import { currentUser } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { formatDateTimeShort } from "@/lib/format";
import { bookings, classSessions, sports } from "@/db/schema";
import { cancelOwnBooking } from "./actions";

const statusLabels: Record<string, string> = {
  pending: "Изчаква плащане",
  confirmed: "Потвърдена",
  cancelled: "Отказана",
};

const statusColor: Record<string, string> = {
  pending: "text-amber-600",
  confirmed: "text-green-700",
  cancelled: "text-red-600",
};

export default async function MyBookingsPage() {
  const user = await currentUser();
  const db = getDb();

  const myBookings = user
    ? await db
        .select({
          id: bookings.id,
          status: bookings.status,
          startTime: classSessions.startTime,
          endTime: classSessions.endTime,
          sportName: sports.name,
          priceCents: classSessions.priceCents,
        })
        .from(bookings)
        .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
        .innerJoin(sports, eq(classSessions.sportId, sports.id))
        .where(eq(bookings.userId, user.id))
        .orderBy(desc(classSessions.startTime))
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl">Моите резервации</h1>

      {!user && (
        <p className="mt-4 text-ink/60">
          Влез в профила си, за да видиш резервациите си.
        </p>
      )}

      {user && myBookings.length === 0 && (
        <p className="mt-4 text-ink/50">Нямаш направени резервации.</p>
      )}

      <div className="mt-8 space-y-3">
        {myBookings.map((b) => {
          const canCancel =
            b.status !== "cancelled" && b.startTime.getTime() > Date.now();
          return (
            <div
              key={b.id}
              className="flex flex-col gap-3 border-l-4 border-accent bg-paper-dim p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-display text-lg">{b.sportName}</p>
                <p className="text-sm text-ink/60">
                  {formatDateTimeShort(b.startTime)}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="font-display">
                  {(b.priceCents / 100).toFixed(2)} €
                </p>
                <span className={`text-sm ${statusColor[b.status]}`}>
                  {statusLabels[b.status]}
                </span>
                {canCancel && (
                  <form
                    action={async () => {
                      "use server";
                      await cancelOwnBooking(b.id);
                    }}
                  >
                    <button className="mt-1 block text-sm text-red-600 hover:underline">
                      Откажи
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDb } from "@/db";
import { formatDateTimeShort } from "@/lib/format";
import { bookings, classSessions, sports } from "@/db/schema";
import { cancelOwnBooking } from "./actions";
import { getSavedPhone } from "@/lib/user-phone";
import { signInUrl } from "@/lib/safe-next";
import VerifyEmailBanner from "./verify-email-banner";
import PhoneForm from "./phone-form";

const statusLabels: Record<string, string> = {
  pending: "Плащане на място",
  confirmed: "Потвърдена",
  cancelled: "Отказана",
};

const statusColor: Record<string, string> = {
  pending: "text-amber-600",
  confirmed: "text-green-700",
  cancelled: "text-red-600",
};

export default async function MyBookingsPage() {
  const session = await getSession();
  const user = session?.user ?? null;
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

  const savedPhone = user ? await getSavedPhone(user.id) : null;

  // Server component: rendered per request, so Date.now() is stable within this
  // render; cancelOwnBooking re-checks on submit anyway.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-4xl">Моите резервации</h1>

      {user && !session?.user.emailVerified && <VerifyEmailBanner email={user.email} />}

      {user && <PhoneForm initialPhone={savedPhone} />}

      {!user && (
        <p className="mt-4 text-ink/60">
          Влез в профила си, за да видиш резервациите си.{" "}
          <Link
            href={signInUrl("/my-bookings")}
            className="text-accent-deep underline underline-offset-2"
          >
            Вход
          </Link>
        </p>
      )}

      {user && myBookings.length === 0 && (
        <div className="mt-4">
          <p className="text-ink/50">Нямаш направени резервации.</p>
          <Link
            href="/schedule"
            className="press font-display mt-4 inline-flex min-h-11 items-center bg-accent px-6 text-sm tracking-wide text-accent-ink"
          >
            Виж графика
          </Link>
        </div>
      )}

      <div className="mt-8 space-y-3">
        {myBookings.map((b) => {
          const canCancel = b.status !== "cancelled" && b.startTime.getTime() > now;
          // A class that already happened shows "Минал", not "Плащане на място" —
          // there is nothing left to pay for on the spot.
          const isPast = b.startTime.getTime() <= now;
          const label = isPast && b.status !== "cancelled" ? "Минал" : statusLabels[b.status];
          const tone = isPast && b.status !== "cancelled" ? "text-ink/50" : statusColor[b.status];
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
                <span className={`text-sm ${tone}`}>{label}</span>
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

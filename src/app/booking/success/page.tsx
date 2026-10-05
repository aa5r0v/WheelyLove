import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getOwnBookingDetail } from "@/lib/bookings";
import { formatDateTimeLong } from "@/lib/format";
import BookingCalendarActions from "@/components/booking-calendar-actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  // ?s=<booking id> shows WHICH hour was booked — but only to its owner;
  // anyone else's id (or a junk value) gets the generic success text.
  const raw = Number(first(sp.s));
  const bookingId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const session = await getSession();
  const booking =
    session && bookingId !== null ? await getOwnBookingDetail(session.user.id, bookingId) : null;
  // Calendar buttons only while the hour is still ahead and not cancelled.
  // Server component rendered per request, so Date.now() is stable within this
  // render (same reasoning as /my-bookings).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const showCalendar =
    !!booking && booking.status !== "cancelled" && booking.startTime.getTime() > now;

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent">
        УСПЕХ
      </p>
      <h1 className="font-display mt-3 text-4xl">Мястото ти е запазено</h1>
      {booking ? (
        <p className="mt-4 text-ink/80">
          Записа се за <strong>{booking.sportName}</strong> —{" "}
          {formatDateTimeLong(booking.startTime)}
        </p>
      ) : null}
      <p className="mt-4 text-ink/60">
        Плащането е на място в студиото — преди началото на тренировката. Ще ти
        пратим напомняне по имейл в деня преди тренировката.
      </p>
      {showCalendar && booking && (
        <div className="mt-8 flex justify-center text-left">
          <BookingCalendarActions
            sessionId={booking.sessionId}
            sportName={booking.sportName}
            instructorName={booking.instructorName}
            startTime={booking.startTime}
            endTime={booking.endTime}
          />
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/my-bookings"
          className="font-display inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
        >
          Моите резервации
        </Link>
        <Link
          href="/schedule"
          className="font-display inline-block bg-accent px-6 py-3 text-sm tracking-wide text-accent-ink"
        >
          Още часове
        </Link>
      </div>
    </div>
  );
}

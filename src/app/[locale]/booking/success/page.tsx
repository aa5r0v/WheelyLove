import { getSession } from "@/lib/auth";
import { getOwnBookingDetail } from "@/lib/bookings";
import { formatDateTimeLong } from "@/lib/format";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/locale";
import { sportName } from "@/lib/sport-content";
import BookingCalendarActions from "@/components/booking-calendar-actions";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;


// Частна страница: няма място в индекса на търсачите.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BookingSuccessPage(
{
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const locale = resolveLocale(await getLocale());
  const t = await getTranslations("bookingSuccess");
  const tNav = await getTranslations("nav");
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
        {t("label")}
      </p>
      <h1 className="font-display mt-3 text-4xl">{t("title")}</h1>
      {booking ? (
        <p className="mt-4 text-ink/80">
          {t.rich("bookedLine", {
            sport: sportName(booking.sportName, locale),
            date: formatDateTimeLong(booking.startTime, locale),
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
      ) : null}
      <p className="mt-4 text-ink/60">{t("text")}</p>
      {showCalendar && booking && (
        <div className="mt-8 flex justify-center text-left">
          <BookingCalendarActions
            sessionId={booking.sessionId}
            sportName={booking.sportName}
            instructorName={booking.instructorName}
            startTime={booking.startTime}
            endTime={booking.endTime}
            locale={locale}
          />
        </div>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/my-bookings"
          className="font-display inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
        >
          {tNav("myBookings")}
        </Link>
        <Link
          href="/schedule"
          className="font-display inline-block bg-accent px-6 py-3 text-sm tracking-wide text-accent-ink"
        >
          {t("moreHours")}
        </Link>
      </div>
    </div>
  );
}

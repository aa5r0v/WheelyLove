import { getTranslations } from "next-intl/server";
import { googleCalendarUrl, sessionCalendarDescription, sessionCalendarTitle } from "@/lib/calendar";
import { STUDIO_ADDRESS_LINE, STUDIO_DIRECTIONS_URL } from "@/lib/studio";
import { sportName as localizedSportName } from "@/lib/sport-content";
import type { AppLocale } from "@/i18n/routing";

// Calendar + navigation for one booked session: Google Calendar link, the
// server-rendered .ics (Apple / Outlook) and directions to the studio. Rendered
// on /booking/success and /my-bookings for upcoming, non-cancelled bookings.
export default async function BookingCalendarActions({
  sessionId,
  sportName,
  instructorName,
  startTime,
  endTime,
  locale = "bg",
}: {
  sessionId: number;
  sportName: string;
  instructorName: string;
  startTime: Date;
  endTime: Date;
  locale?: AppLocale;
}) {
  const t = await getTranslations({ locale, namespace: "calendarActions" });
  const googleUrl = googleCalendarUrl({
    title: sessionCalendarTitle(localizedSportName(sportName, locale)),
    start: startTime,
    end: endTime,
    details: sessionCalendarDescription(instructorName, locale),
    location: STUDIO_ADDRESS_LINE,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="press font-display inline-flex min-h-11 items-center bg-accent px-4 text-sm tracking-wide text-accent-ink"
        >
          {t("google")}
        </a>
        <a
          href={`/api/calendar/session/${sessionId}?l=${locale}`}
          className="press font-display inline-flex min-h-11 items-center border-2 border-ink px-4 text-sm tracking-wide transition-colors hover:bg-ink hover:text-paper"
        >
          {t("ics")}
        </a>
        <a
          href={STUDIO_DIRECTIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="press font-display inline-flex min-h-11 items-center border-2 border-ink px-4 text-sm tracking-wide transition-colors hover:bg-ink hover:text-paper"
        >
          {t("howToGet")}
        </a>
      </div>
      <p className="text-sm text-ink/60">{STUDIO_ADDRESS_LINE}</p>
    </div>
  );
}

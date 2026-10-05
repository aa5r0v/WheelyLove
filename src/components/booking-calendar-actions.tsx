import { googleCalendarUrl, sessionCalendarDescription, sessionCalendarTitle } from "@/lib/calendar";
import { STUDIO_ADDRESS_LINE, STUDIO_DIRECTIONS_URL } from "@/lib/studio";

// Calendar + navigation for one booked session: Google Calendar link, the
// server-rendered .ics (Apple / Outlook) and directions to the studio. Rendered
// on /booking/success and /my-bookings for upcoming, non-cancelled bookings.
export default function BookingCalendarActions({
  sessionId,
  sportName,
  instructorName,
  startTime,
  endTime,
}: {
  sessionId: number;
  sportName: string;
  instructorName: string;
  startTime: Date;
  endTime: Date;
}) {
  const googleUrl = googleCalendarUrl({
    title: sessionCalendarTitle(sportName),
    start: startTime,
    end: endTime,
    details: sessionCalendarDescription(instructorName),
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
          Добави в Google Calendar
        </a>
        <a
          href={`/api/calendar/session/${sessionId}`}
          className="press font-display inline-flex min-h-11 items-center border-2 border-ink px-4 text-sm tracking-wide transition-colors hover:bg-ink hover:text-paper"
        >
          Добави в Apple / Outlook
        </a>
        <a
          href={STUDIO_DIRECTIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="press font-display inline-flex min-h-11 items-center border-2 border-ink px-4 text-sm tracking-wide transition-colors hover:bg-ink hover:text-paper"
        >
          Как да стигна
        </a>
      </div>
      <p className="text-sm text-ink/60">{STUDIO_ADDRESS_LINE}</p>
    </div>
  );
}

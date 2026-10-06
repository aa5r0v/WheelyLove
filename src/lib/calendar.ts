// Calendar helpers for a class session: a Google Calendar "add event" URL and
// an RFC 5545 .ics file. Only PUBLIC session data ever goes in here — never a
// client's name, email, phone or booking id (the functions cannot even receive
// them).
import { STUDIO_ADDRESS_LINE, STUDIO_DIRECTIONS_URL, STUDIO_LOCATION, STUDIO_MAP_URL } from "./studio";

// "YYYYMMDDTHHMMSSZ" — calendar URLs and ICS times are always UTC.
export function formatUtcStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

export function googleCalendarUrl(params: {
  title: string;
  start: Date;
  end: Date;
  details: string;
  location: string;
}): string {
  const search = new URLSearchParams({
    action: "TEMPLATE",
    text: params.title,
    dates: `${formatUtcStamp(params.start)}/${formatUtcStamp(params.end)}`,
    details: params.details,
    location: params.location,
  });
  return `https://calendar.google.com/calendar/render?${search.toString()}`;
}

// The texts shared by the .ics route, the on-page buttons and the emails, so
// every calendar entry for a session looks the same.
export function sessionCalendarTitle(sportName: string): string {
  return `WheelyLove: ${sportName}`;
}

const CALENDAR_DESCRIPTIONS = {
  bg: (instructorName: string) =>
    `Инструктор: ${instructorName}. Плащане на място.\nКак да стигна: ${STUDIO_DIRECTIONS_URL}`,
  en: (instructorName: string) =>
    `Instructor: ${instructorName}. Payment on site.\nHow to get here: ${STUDIO_DIRECTIONS_URL}`,
} as const;

export function sessionCalendarDescription(instructorName: string, locale: "bg" | "en" = "bg"): string {
  return CALENDAR_DESCRIPTIONS[locale](instructorName);
}

const ICS_REMINDER_TEXT = {
  bg: "Напомняне: тренировката ти започва след 2 часа.",
  en: "Reminder: your class starts in 2 hours.",
} as const;

// RFC 5545 TEXT escaping: backslash, semicolon, comma and line breaks.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/[\r\n]/g, "\\n");
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// RFC 5545 3.1: content lines longer than 75 OCTETS are folded with CRLF + a
// single space. Octets, not characters — Cyrillic letters are 2 bytes each —
// and a multi-byte character must never be split, so the cut is moved back to
// the character boundary. The first line carries 75 octets, continuation lines
// only 74 (the leading space counts).
function foldLine(line: string): string {
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    const budget = first ? 75 : 74;
    first = false;
    let take = Math.min(budget, bytes.length - offset);
    // (bytes[i] & 0xc0) === 0x80 marks a UTF-8 continuation byte: cutting there
    // would split a character, so back off to the previous boundary.
    while (take > 0 && offset + take < bytes.length && (bytes[offset + take] & 0xc0) === 0x80) {
      take--;
    }
    parts.push(decoder.decode(bytes.subarray(offset, offset + take)));
    offset += take;
  }
  return parts.join("\r\n ");
}

export function buildSessionIcs(params: {
  sessionId: number;
  title: string;
  start: Date;
  end: Date;
  description: string;
  now: Date;
  locale?: "bg" | "en";
}): string {
  const text = (name: string, value: string) => foldLine(`${name}:${escapeText(value)}`);
  const stamp = (name: string, d: Date) => `${name}:${formatUtcStamp(d)}`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WheelyLove//BG",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:session-${params.sessionId}@wheelylove.net`,
    stamp("DTSTAMP", params.now),
    stamp("DTSTART", params.start),
    stamp("DTEND", params.end),
    text("SUMMARY", params.title),
    text("DESCRIPTION", params.description),
    text("LOCATION", STUDIO_ADDRESS_LINE),
    // GEO coordinates are a structured value (lat;lng), not TEXT — no escaping.
    `GEO:${STUDIO_LOCATION.lat};${STUDIO_LOCATION.lng}`,
    `URL:${STUDIO_MAP_URL}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    text("DESCRIPTION", ICS_REMINDER_TEXT[params.locale ?? "bg"]),
    "TRIGGER:-PT2H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

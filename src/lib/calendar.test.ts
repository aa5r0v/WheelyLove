import { describe, it, expect } from "vitest";
import {
  buildSessionIcs,
  googleCalendarUrl,
  sessionCalendarDescription,
  sessionCalendarTitle,
} from "./calendar";
import { fromSofiaDateTime } from "./format";
import { STUDIO_ADDRESS_LINE, STUDIO_DIRECTIONS_URL, STUDIO_MAP_URL } from "./studio";

const encoder = new TextEncoder();

// RFC 5545 unfolding: a CRLF followed by one space continues the previous line.
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("googleCalendarUrl", () => {
  it("puts the UTC date stamps, title, details and location in the URL", () => {
    const url = googleCalendarUrl({
      title: "WheelyLove: Спининг",
      start: new Date("2026-11-01T16:00:00Z"),
      end: new Date("2026-11-01T16:45:00Z"),
      details: "Инструктор: Ели",
      location: STUDIO_ADDRESS_LINE,
    });
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get("action")).toBe("TEMPLATE");
    expect(params.get("text")).toBe("WheelyLove: Спининг");
    expect(params.get("dates")).toBe("20261101T160000Z/20261101T164500Z");
    expect(params.get("details")).toBe("Инструктор: Ели");
    expect(params.get("location")).toBe(STUDIO_ADDRESS_LINE);
  });

  it("keeps the correct UTC hour across the Sofia DST switch on 2026-10-25", () => {
    // 2026-10-24 is still EEST (UTC+3): 18:15 Sofia = 15:15 UTC.
    // On 2026-10-25 Sofia runs on EET (UTC+2): 18:15 Sofia = 16:15 UTC.
    const before = googleCalendarUrl({
      title: "t",
      start: fromSofiaDateTime("2026-10-24", "18:15"),
      end: fromSofiaDateTime("2026-10-24", "19:00"),
      details: "d",
      location: "l",
    });
    const after = googleCalendarUrl({
      title: "t",
      start: fromSofiaDateTime("2026-10-25", "18:15"),
      end: fromSofiaDateTime("2026-10-25", "19:00"),
      details: "d",
      location: "l",
    });
    expect(new URL(before).searchParams.get("dates")).toBe("20261024T151500Z/20261024T160000Z");
    expect(new URL(after).searchParams.get("dates")).toBe("20261025T161500Z/20261025T170000Z");
  });
});

describe("buildSessionIcs", () => {
  const start = new Date("2026-10-25T16:15:00Z");
  const end = new Date("2026-10-25T17:10:00Z");
  const now = new Date("2026-10-20T10:00:00Z");

  // Deliberately hostile TEXT values: ; , \ and a newline.
  const title = `WheelyLove: Пилатес; мека, сила \\ тест`;
  const description = "Инструктор: Ани; Величкова.\nПлащане на място.";

  const ics = buildSessionIcs({ sessionId: 42, title, start, end, description, now });

  it("ends every line with CRLF and contains no bare LF or CR", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics).not.toMatch(/(?<!\r)\n/);
    expect(ics).not.toMatch(/\r(?!\n)/);
  });

  it("has the fixed VCALENDAR, VEVENT and VALARM fields", () => {
    const lines = unfold(ics);
    for (const must of [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//WheelyLove//BG",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:session-42@wheelylove.net`,
      "DTSTAMP:20261020T100000Z",
      "DTSTART:20261025T161500Z",
      "DTEND:20261025T171000Z",
      `GEO:43.4359705;28.337232`,
      `URL:${STUDIO_MAP_URL}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT2H",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ]) {
      expect(lines).toContain(must);
    }
  });

  it("escapes TEXT values: backslash, semicolon, comma and newline", () => {
    const lines = unfold(ics);
    expect(lines).toContain("SUMMARY:WheelyLove: Пилатес\\; мека\\, сила \\\\ тест");
    expect(lines).toContain("DESCRIPTION:Инструктор: Ани\\; Величкова.\\nПлащане на място.");
    // The studio address line contains a comma, so as a TEXT value it is escaped.
    expect(lines).toContain(`LOCATION:${STUDIO_ADDRESS_LINE.replace(/,/g, "\\,")}`);
  });

  it("folds long Cyrillic lines to ≤ 75 octets and unfolds back to the original", () => {
    const longDescription = `Инструктор: ${"А".repeat(120)}. Плащане на място.`; // Cyrillic А = 2 bytes
    const longIcs = buildSessionIcs({
      sessionId: 7,
      title: "WheelyLove: Спининг",
      start,
      end,
      description: longDescription,
      now,
    });
    for (const physical of longIcs.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
    }
    // Unfolding must reconstruct the logical line byte for byte — no multi-byte
    // character was cut in half.
    expect(unfold(longIcs)).toContain(`DESCRIPTION:${longDescription}`);
  });

  it("cannot even receive client data: extra properties are a compile-time error", () => {
    buildSessionIcs({
      sessionId: 1,
      title: "t",
      start,
      end,
      description: "d",
      now,
      // @ts-expect-error client data (email/name/booking id) is not accepted
      userEmail: "client@example.com",
    });
  });
});

describe("session calendar texts", () => {
  it("composes the title and description from public session data only", () => {
    expect(sessionCalendarTitle("Спининг")).toBe("WheelyLove: Спининг");
    const description = sessionCalendarDescription("Ели");
    expect(description).toContain("Инструктор: Ели. Плащане на място.");
    expect(description).toContain(STUDIO_DIRECTIONS_URL);
  });
});

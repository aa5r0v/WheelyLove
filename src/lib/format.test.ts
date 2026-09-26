import { describe, it, expect } from "vitest";
import {
  formatPrice,
  formatTime,
  formatDateLong,
  fromSofiaDateTime,
  toSofiaDateInput,
  toSofiaTimeInput,
} from "./format";

describe("formatPrice", () => {
  it("formats cents as euros with two decimals", () => {
    expect(formatPrice(600)).toBe("6.00 €");
    expect(formatPrice(1250)).toBe("12.50 €");
    expect(formatPrice(0)).toBe("0.00 €");
  });
});

describe("formatTime", () => {
  it("formats a Date as HH:MM in Sofia time, whatever the server time zone", () => {
    expect(formatTime(new Date(Date.UTC(2026, 0, 15, 16, 5)))).toMatch(/18:05/); // winter, UTC+2
    expect(formatTime(new Date(Date.UTC(2026, 6, 15, 15, 5)))).toMatch(/18:05/); // summer, UTC+3
  });
});

describe("formatDateLong", () => {
  it("includes weekday, day, and month", () => {
    const d = new Date(2026, 0, 15);
    const result = formatDateLong(d);
    expect(result).toContain("15");
  });
});

describe("fromSofiaDateTime", () => {
  it("interprets studio-entered times as Sofia time", () => {
    expect(fromSofiaDateTime("2026-01-15", "18:00").toISOString()).toBe("2026-01-15T16:00:00.000Z");
    expect(fromSofiaDateTime("2026-07-15", "18:00").toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });

  it("adds days across a daylight-saving change without shifting the wall-clock time", () => {
    // 2026-10-25 is the switch from summer to winter time in Bulgaria.
    expect(fromSofiaDateTime("2026-10-20", "18:00", 7).toISOString()).toBe("2026-10-27T16:00:00.000Z");
  });

  it("round-trips with the admin form input helpers", () => {
    const d = fromSofiaDateTime("2026-09-30", "19:57");
    expect(toSofiaDateInput(d)).toBe("2026-09-30");
    expect(toSofiaTimeInput(d)).toBe("19:57");
  });
});

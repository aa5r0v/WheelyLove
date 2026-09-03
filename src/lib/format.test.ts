import { describe, it, expect } from "vitest";
import { formatPrice, formatTime, formatDateLong } from "./format";

describe("formatPrice", () => {
  it("formats cents as euros with two decimals", () => {
    expect(formatPrice(600)).toBe("6.00 €");
    expect(formatPrice(1250)).toBe("12.50 €");
    expect(formatPrice(0)).toBe("0.00 €");
  });
});

describe("formatTime", () => {
  it("formats a Date as HH:MM in bg-BG locale", () => {
    const d = new Date(2026, 0, 15, 18, 5);
    expect(formatTime(d)).toMatch(/18:05/);
  });
});

describe("formatDateLong", () => {
  it("includes weekday, day, and month", () => {
    const d = new Date(2026, 0, 15);
    const result = formatDateLong(d);
    expect(result).toContain("15");
  });
});

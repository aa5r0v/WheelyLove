import { describe, it, expect } from "vitest";
import { normalizeBgPhone, normalizePhone } from "./phone";

describe("normalizeBgPhone", () => {
  it("normalizes local numbers to E.164", () => {
    expect(normalizeBgPhone("0888123456")).toBe("+359888123456");
    expect(normalizeBgPhone("088 812 3456")).toBe("+359888123456");
  });
  it("keeps valid +359 numbers", () => {
    expect(normalizeBgPhone("+359888123456")).toBe("+359888123456");
    expect(normalizeBgPhone(" +359 888-123-456 ")).toBe("+359888123456");
    expect(normalizeBgPhone("028123456")).toBe("+35928123456");
  });
  it("rejects foreign, malformed and premium-style input", () => {
    for (const bad of [
      "",
      "+4915112345678",
      "00359888123456",
      "+3590888123456",
      "088812",
      "+359888123456789",
      "abc",
      "0888123456; drop",
      "+1 555 123 4567",
    ]) {
      expect(normalizeBgPhone(bad)).toBeNull();
    }
  });
});

describe("normalizePhone", () => {
  it("keeps the Bulgarian behaviour", () => {
    expect(normalizePhone("0888123456")).toBe("+359888123456");
    expect(normalizePhone("+359 888-123-456")).toBe("+359888123456");
  });
  it("accepts foreign E.164 numbers (RO, DE) and cleans separators", () => {
    expect(normalizePhone("+40 712 345 678")).toBe("+40712345678");
    expect(normalizePhone("+49 (151) 1234-5678")).toBe("+4915112345678");
    expect(normalizePhone(" +1 555 123 4567 ")).toBe("+15551234567");
  });
  it("rejects invalid numbers", () => {
    for (const bad of [
      "",
      "abc",
      "40712345678", // no plus
      "0040712345678", // 00 prefix
      "+0712345678", // first digit 0
      "+4071234", // too short (6 digits)
      "+4071234567890123", // too long (16 digits)
      "+40 712 345 678; drop",
      "+3590888123456", // +359 stays under strict Bulgarian rules
      "+359888123456789",
      "088812",
    ]) {
      expect(normalizePhone(bad), bad).toBeNull();
    }
  });
});

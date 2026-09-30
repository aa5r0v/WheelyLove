import { describe, it, expect } from "vitest";
import { normalizeBgPhone } from "./phone";

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

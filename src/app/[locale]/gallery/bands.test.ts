import { describe, expect, it } from "vitest";
import { BAND_SIZES, planBands } from "./bands";

describe("planBands", () => {
  it("returns no bands for an empty gallery", () => {
    expect(planBands(0)).toEqual([]);
  });

  it("a single item becomes a full-width statement", () => {
    expect(planBands(1)).toEqual([{ archetype: "statement", slots: [0] }]);
  });

  it("two items become one pair band instead of two full-bleed rows", () => {
    expect(planBands(2)).toEqual([{ archetype: "pair", slots: [0, 1] }]);
  });

  it("three items become a statement lead plus a pair", () => {
    expect(planBands(3)).toEqual([
      { archetype: "statement", slots: [0] },
      { archetype: "pair", slots: [1, 2] },
    ]);
  });

  it("four items open with a large duo frame, closed by its mirror", () => {
    expect(planBands(4)).toEqual([
      { archetype: "duo", slots: [0, 1] },
      { archetype: "mirror", slots: [2, 3] },
    ]);
  });

  it("covers every item exactly once, in collection order, for any size", () => {
    for (let n = 5; n <= 40; n++) {
      const flat = planBands(n).flatMap((b) => b.slots);
      expect(flat, `n=${n}`).toEqual([...Array(n).keys()]);
    }
  });

  it("never leaves a partial band at the tail (no holes in the last row)", () => {
    for (let n = 5; n <= 40; n++) {
      for (const band of planBands(n)) {
        expect(band.slots.length, `n=${n} ${band.archetype}`).toBe(
          BAND_SIZES[band.archetype]
        );
      }
    }
  });
});

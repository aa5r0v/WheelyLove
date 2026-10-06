// Deterministic editorial band plan for the gallery composition: groups item
// indices into bands whose slot counts the CSS turns into asymmetric frames
// (column spans + aspect ratios per breakpoint). The grouping is the only
// branching part, so it lives here as a pure function and is unit-tested.

export type GalleryItem = {
  id: number;
  type: "image" | "video";
  url: string;
  caption: string | null;
};

export type BandArchetype =
  | "statement"
  | "duo"
  | "trio"
  | "mirror"
  | "pair"
  | "solo";

export type Band = { archetype: BandArchetype; slots: number[] };

export const BAND_SIZES: Record<BandArchetype, number> = {
  statement: 1,
  duo: 2,
  trio: 3,
  mirror: 2,
  pair: 2,
  solo: 1,
};

// statement = full-bleed lead; duo = wide + portrait; trio = three varied
// frames; mirror = duo with the portrait on the other side. pair/solo exist
// only to close a tail so the last row is always fully packed.
const CYCLE: BandArchetype[] = ["statement", "duo", "trio", "mirror"];

export function planBands(count: number): Band[] {
  if (count <= 0) return [];
  if (count === 1) return [{ archetype: "statement", slots: [0] }];
  if (count === 2) return [{ archetype: "pair", slots: [0, 1] }];
  if (count === 3)
    return [
      { archetype: "statement", slots: [0] },
      { archetype: "pair", slots: [1, 2] },
    ];
  if (count === 4)
    return [
      { archetype: "duo", slots: [0, 1] },
      { archetype: "mirror", slots: [2, 3] },
    ];

  const bands: Band[] = [];
  let i = 0;
  let cyclePos = 0;
  while (i < count) {
    const left = count - i;
    if (left === 1) {
      bands.push({ archetype: "solo", slots: [i] });
      break;
    }
    if (left === 2) {
      bands.push({ archetype: "pair", slots: [i, i + 1] });
      break;
    }
    const archetype = CYCLE[cyclePos % CYCLE.length];
    const size = BAND_SIZES[archetype];
    bands.push({
      archetype,
      slots: Array.from({ length: size }, (_, k) => i + k),
    });
    i += size;
    cyclePos += 1;
  }
  return bands;
}

export const SPORT_LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;
export type SportLevel = (typeof SPORT_LEVELS)[number];

export const LEVEL_LABELS: Record<SportLevel, string> = {
  all: "Всички нива",
  beginner: "Начинаещи",
  intermediate: "Средно ниво",
  advanced: "Напреднали",
};

export function parseLevel(v: FormDataEntryValue | null): SportLevel {
  const s = String(v ?? "");
  return (SPORT_LEVELS as readonly string[]).includes(s) ? (s as SportLevel) : "all";
}

// Optional positive integer from a form field ("" -> null).
export function parseOptionalInt(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Euro amount typed by the admin ("12.50") -> cents; "" -> null.
export function parseOptionalEuroToCents(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

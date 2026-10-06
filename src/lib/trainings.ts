export const SPORT_LEVELS = ["all", "beginner", "intermediate", "advanced"] as const;
export type SportLevel = (typeof SPORT_LEVELS)[number];

export const LEVEL_LABELS: Record<SportLevel, string> = {
  all: "Всички нива",
  beginner: "Начинаещи",
  intermediate: "Средно ниво",
  advanced: "Напреднали",
};

const LEVEL_LABELS_EN: Record<SportLevel, string> = {
  all: "All levels",
  beginner: "Beginners",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

// Публичните страници показват етикета на езика на страницата; админ панелът
// остава на български (LEVEL_LABELS директно).
export function levelLabel(level: string, locale: "bg" | "en" = "bg"): string {
  const labels = locale === "en" ? LEVEL_LABELS_EN : LEVEL_LABELS;
  return labels[level as SportLevel] ?? labels.all;
}

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

export const WEEKDAY_LABELS = [
  "Понеделник",
  "Вторник",
  "Сряда",
  "Четвъртък",
  "Петък",
  "Събота",
  "Неделя",
] as const; // index = ISO weekday - 1

export type TemplateInput = {
  sportId: number;
  instructorId: number;
  weekday: number;
  startTime: string;
  durationMin: number;
  capacity: number;
  priceCents: number;
};

// Validates the admin template form. Blank duration/capacity/price fall back to
// the sport's defaults (passed in by the caller).
export function parseTemplateForm(
  fd: FormData,
  defaults: { defaultDurationMin: number | null; defaultCapacity: number; defaultPriceCents: number | null }
): TemplateInput {
  const sportId = Number(fd.get("sportId"));
  const instructorId = Number(fd.get("instructorId"));
  const weekday = Number(fd.get("weekday"));
  const startTime = String(fd.get("startTime") ?? "");
  const durationMin = parseOptionalInt(fd.get("durationMin")) ?? defaults.defaultDurationMin;
  const capacity = parseOptionalInt(fd.get("capacity")) ?? defaults.defaultCapacity;
  const priceCents = parseOptionalEuroToCents(fd.get("price")) ?? defaults.defaultPriceCents;

  if (!Number.isInteger(sportId) || !Number.isInteger(instructorId)) throw new Error("Избери тренировка и инструктор.");
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) throw new Error("Невалиден ден от седмицата.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error("Невалиден час на започване (ЧЧ:ММ).");
  if (durationMin === null || durationMin > 600) throw new Error("Въведи продължителност в минути (или задай такава на тренировката).");
  if (priceCents === null) throw new Error("Въведи цена (или задай такава на тренировката).");
  return { sportId, instructorId, weekday, startTime, durationMin, capacity, priceCents };
}

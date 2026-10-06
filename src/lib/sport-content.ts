import type { AppLocale } from "./locale";

// Статични преводи на seed-натото в scripts/seed.ts съдържание (име и
// описание на тренировките). Заменя се САМО при точно съвпадение: текст,
// редактиран от студиото, остава непипнат — не си измисляме преводи на
// произволно авторско съдържание. Българските страници виждат оригинала.

const KNOWN_NAMES: Record<string, string> = {
  Спининг: "Spinning",
  Пилатес: "Pilates",
};

const KNOWN_DESCRIPTIONS: Record<string, string> = {
  "Интензивна кардио тренировка на велоергометър в ритъм на музика.":
    "An intense cardio workout on a stationary bike, riding to the rhythm of the music.",
  "Контролирани движения за сила, стабилност и гъвкавост.":
    "Controlled movements for strength, stability and flexibility.",
  "Силова тренировка с тежести за издръжливост и тонус на цялото тяло.":
    "Strength training with weights for full-body endurance and tone.",
};

export function sportName(name: string, locale: AppLocale): string {
  return locale === "en" ? (KNOWN_NAMES[name] ?? name) : name;
}

export function sportDescription(
  description: string | null,
  locale: AppLocale
): string | null {
  if (locale !== "en" || !description) return description;
  return KNOWN_DESCRIPTIONS[description] ?? description;
}

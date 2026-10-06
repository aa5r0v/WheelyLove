import { headers } from "next/headers";
import type { AppLocale } from "@/i18n/routing";

// Съобщения, родени на сървъра и показвани сурови в клиента (checkout API,
// server actions). API маршрутите нямат middleware header — те подават
// извлечения локейл изрично; actions използват getLocale().

const ERRORS = {
  unauth: { bg: "Неоторизиран достъп.", en: "Unauthorized." },
  verifyEmailBooking: {
    bg: "Потвърди имейла си, за да резервираш — нов линк можеш да получиш от „Моите резервации“.",
    en: "Confirm your email to book — you can get a fresh link from “My bookings”.",
  },
  verifyEmailWaitlist: {
    bg: "Потвърди имейла си, за да се запишеш — нов линк можеш да получиш от „Моите резервации“.",
    en: "Confirm your email to join — you can get a fresh link from “My bookings”.",
  },
  invalidRequest: { bg: "Невалидна заявка.", en: "Invalid request." },
  invalidPhone: {
    bg: "Невалиден телефонен номер. Въведи български (08… или +359…) или международен номер (+код на държавата…).",
    en: "Invalid phone number. Enter a Bulgarian (08… or +359…) or an international one (+country code…).",
  },
  sessionNotFound: { bg: "Часът не съществува.", en: "This class does not exist." },
  sessionStarted: {
    bg: "Часът вече е започнал или е минал.",
    en: "This class has already started or is in the past.",
  },
  duplicateBooking: {
    bg: "Вече имаш резервация за този час.",
    en: "You already have a booking for this class.",
  },
  rateLimited: {
    bg: "Твърде много опити за резервация. Опитайте отново по-късно.",
    en: "Too many booking attempts. Please try again later.",
  },
  noSpots: { bg: "Няма свободни места.", en: "No spots available." },
  waitlistUnavailable: { bg: "Часът не е наличен.", en: "This class is not available." },
  waitlistHasSpots: {
    bg: "Има свободни места — можеш да се запишеш директно.",
    en: "There are free spots — you can book directly.",
  },
  waitlistTooMany: {
    bg: "Твърде много записвания в списъка на чакащите.",
    en: "Too many waitlist entries.",
  },
  bookingNotFound: { bg: "Резервацията не съществува.", en: "The booking does not exist." },
  cancelPast: {
    bg: "Не може да откажеш резервация за час, който вече е минал.",
    en: "You cannot cancel a booking for a class that has already taken place.",
  },
} as const;

export type ServerErrorKey = keyof typeof ERRORS;

export function serverError(key: ServerErrorKey, locale: AppLocale): string {
  return ERRORS[key][locale];
}

// За server actions: локейлът идва от middleware header-а на заявката
// (X-NEXT-INTL-LOCALE — сетва го next-intl proxy-то). Извън request scope
// (тестове) пада на български.
export async function actionError(key: ServerErrorKey): Promise<string> {
  let locale: AppLocale = "bg";
  try {
    if ((await headers()).get("X-NEXT-INTL-LOCALE") === "en") locale = "en";
  } catch {
    // no request scope
  }
  return serverError(key, locale);
}

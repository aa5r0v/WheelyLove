// The studio is in Bulgaria but the servers run in UTC — always pin times to Sofia.
export const STUDIO_TIME_ZONE = "Europe/Sofia";

export function formatDateLong(d: Date) {
  return d.toLocaleDateString("bg-BG", {
    timeZone: STUDIO_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("bg-BG", {
    timeZone: STUDIO_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeLong(d: Date) {
  return d.toLocaleString("bg-BG", {
    timeZone: STUDIO_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeShort(d: Date) {
  return d.toLocaleString("bg-BG", {
    timeZone: STUDIO_TIME_ZONE,
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPrice(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}

function sofiaParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" for <input type="date">, in Sofia time.
export function toSofiaDateInput(d: Date) {
  const p = sofiaParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// "HH:MM" for <input type="time">, in Sofia time.
export function toSofiaTimeInput(d: Date) {
  const p = sofiaParts(d);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

// Interprets a date ("YYYY-MM-DD") and time ("HH:MM") entered by the studio as Sofia time.
export function fromSofiaDateTime(date: string, time: string, addDays = 0) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(y, mo - 1, d + addDays, h, mi);

  // Offset of Sofia from UTC at that moment (+2h winter, +3h summer); re-check once for DST edges.
  const offsetAt = (ms: number) => {
    const p = sofiaParts(new Date(ms));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
  };
  let result = wallClockAsUtc - offsetAt(wallClockAsUtc);
  result = wallClockAsUtc - offsetAt(result);
  return new Date(result);
}

export function formatDateLong(d: Date) {
  return d.toLocaleDateString("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatTime(d: Date) {
  return d.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTimeLong(d: Date) {
  return d.toLocaleString("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPrice(cents: number) {
  return `${(cents / 100).toFixed(2)} €`;
}

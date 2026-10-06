import { revalidatePath } from "next/cache";
import { localeHref } from "./locale";

// Инвалидира и двата изгледа на публичен път: bg (unprefixed) + /en. Публичните
// страници понастоящем са dynamic (виж getSession в тях), така че това пази
// само консистентност — ако някой ден станат кеширани, /en няма да изостава.
export function revalidateLocalized(path: string) {
  revalidatePath(path);
  revalidatePath(localeHref("en", path));
}

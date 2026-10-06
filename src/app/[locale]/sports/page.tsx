import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

// There is no "all sports" page of its own: /sports is only ever typed by hand,
// and the classes section of the home page is where the cards live.
export default async function SportsIndexPage() {
  redirect({ href: "/#classes", locale: await getLocale() });
}

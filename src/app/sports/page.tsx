import { redirect } from "next/navigation";

// There is no "all sports" page of its own: /sports is only ever typed by hand,
// and the classes section of the home page is where the cards live.
export default function SportsIndexPage() {
  redirect("/#classes");
}

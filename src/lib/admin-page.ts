import { notFound } from "next/navigation";
import { isAdmin } from "./admin";

// Every admin page calls this FIRST, before loading any data. The check in
// src/app/admin/layout.tsx is not enough: Next.js renders the page segment
// even when the layout does not render {children}, and its data ends up in the
// RSC payload - a signed-in non-admin saw "Нямаш достъп" while the HTML of
// /admin/bookings carried every client e-mail. notFound() stops the render.
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) notFound();
}

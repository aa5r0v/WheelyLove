import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.user.role !== "admin" || !session.user.emailVerified) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Нямаш достъп</h1>
        <p className="mt-2 text-neutral-600">
          Тази секция е само за администратори на студиото.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 flex gap-4 border-b border-neutral-200 pb-4 text-sm font-medium">
        <Link href="/admin">Табло</Link>
        <Link href="/admin/sessions">Часове</Link>
        <Link href="/admin/bookings">Резервации</Link>
        <Link href="/admin/sports">Спортове</Link>
        <Link href="/admin/instructors">Инструктори</Link>
        <Link href="/admin/gallery">Галерия</Link>
      </nav>
      {children}
    </div>
  );
}

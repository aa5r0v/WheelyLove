import { getSession } from "@/lib/auth";
import { getLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import type { Metadata } from "next";

// Частна страница: няма място в индекса на търсачите.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AdminLayout(
{
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const locale = await getLocale();
  // Админският текст остава на български (по задание); линковете пазят езика
  // на URL-а, за да не „превключва“ публичният хедър след навигация.
  if (!session) return redirect({ href: "/sign-in", locale });
  // Операционните панели живеят САМО на unprefixed BG пътове: nginx пуска
  // големия (55MB) защитен upload само на /admin/gallery — /en/admin/gallery
  // би минал през общия 2MB лимит без auth_request предпроверката.
  if (locale === "en") return redirect({ href: "/admin", locale: "bg" });
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
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-neutral-200 pb-4 text-sm font-medium">
        <Link href="/admin">Табло</Link>
        <Link href="/admin/sessions">Часове</Link>
        <Link href="/admin/schedule">График (шаблон)</Link>
        <Link href="/admin/bookings">Резервации</Link>
        <Link href="/admin/sports">Тренировки</Link>
        <Link href="/admin/instructors">Инструктори</Link>
        <Link href="/admin/gallery">Галерия</Link>
      </nav>
      {children}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getInstructorForSession } from "@/lib/instructor";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  // Not an instructor (or unverified / not linked): the panel does not exist
  // for this user. Pages and actions check again - a layout does not re-run on
  // every navigation.
  const instructor = await getInstructorForSession();
  if (!instructor) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-neutral-200 pb-4 text-sm font-medium">
        <Link href="/instructor">Моите часове</Link>
        <Link href="/instructor/report">Отчет</Link>
        <span className="ml-auto text-neutral-500">{instructor.name}</span>
      </nav>
      {children}
    </div>
  );
}

import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { getInstructorForSession, getMonthReport, resolveMonth } from "@/lib/instructor";

export const dynamic = "force-dynamic";

export default async function InstructorReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const instructor = await getInstructorForSession();
  if (!instructor) notFound();
  const raw = (await searchParams).month;
  const month = resolveMonth(typeof raw === "string" ? raw : undefined);
  const r = await getMonthReport(instructor.id, month);

  const cells: [string, string][] = [
    ["Проведени часове", String(r.sessions)],
    ["Записани", String(r.booked)],
    ["Присъствали", String(r.attended)],
    ["Неявили се", String(r.noShow)],
    ["Запълняемост", `${r.fillPercent}%`],
    ["Сума (плащане на място, информативно)", formatPrice(r.revenueCents)],
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Отчет</h1>
      <form method="get" className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="month"
          name="month"
          defaultValue={month}
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-white">Покажи</button>
      </form>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {cells.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

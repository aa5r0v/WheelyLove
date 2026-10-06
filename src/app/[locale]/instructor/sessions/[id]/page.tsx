import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { formatDateTimeShort } from "@/lib/format";
import { getInstructorForSession, getInstructorSession } from "@/lib/instructor";
import { markAttendance } from "../../actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  pending: "Плащане на място",
  confirmed: "Потвърдена",
};

const ATTENDANCE: Record<string, string> = {
  unknown: "не е отбелязано",
  attended: "присъствал",
  no_show: "неявил се",
};

export default async function InstructorSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const instructor = await getInstructorForSession();
  if (!instructor) notFound();
  const { id } = await params;
  // A session that is not his looks exactly like one that does not exist.
  const s = /^\d+$/.test(id) ? await getInstructorSession(instructor.id, Number(id)) : null;
  if (!s) notFound();

  return (
    <div>
      <Link href="/instructor" className="text-sm text-neutral-500 hover:underline">
        &larr; Моите часове
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{s.sportName}</h1>
      <p className="text-neutral-600">
        {formatDateTimeShort(s.startTime)} · записани {s.bookedCount}/{s.capacity} · чакащи{" "}
        {s.waitingCount}
        {s.cancelledAt && <span className="ml-2 text-red-600">отменен</span>}
      </p>
      {!s.started && (
        <p className="mt-2 text-sm text-amber-700">
          Часът още не е започнал - присъствие се отбелязва след началото.
        </p>
      )}

      <div className="mt-6 space-y-2">
        {s.attendees.length === 0 && <p className="text-sm text-neutral-500">Няма записани.</p>}
        {s.attendees.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3"
          >
            <div>
              <p className="font-medium">{a.name}</p>
              <p className="text-sm text-neutral-500">
                {a.phone} · {STATUS[a.status] ?? a.status} · {ATTENDANCE[a.attendance]}
              </p>
            </div>
            {s.started && !s.cancelledAt && (
              <div className="flex gap-2 text-sm">
                {(["attended", "no_show", "unknown"] as const).map((v) => (
                  <form
                    key={v}
                    action={async () => {
                      "use server";
                      await markAttendance(s.id, a.id, v);
                    }}
                  >
                    <button
                      disabled={a.attendance === v}
                      className="rounded-md border border-neutral-300 px-3 py-1 hover:bg-neutral-100 disabled:bg-neutral-900 disabled:text-white"
                    >
                      {v === "attended" ? "Присъства" : v === "no_show" ? "Неявил се" : "Изчисти"}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

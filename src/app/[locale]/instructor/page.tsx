import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { formatDateTimeShort } from "@/lib/format";
import {
  getInstructorForSession,
  listInstructorSessions,
  type InstructorSessionItem,
} from "@/lib/instructor";

export const dynamic = "force-dynamic";

function Row({ s }: { s: InstructorSessionItem }) {
  return (
    <Link
      href={`/instructor/sessions/${s.id}`}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3 hover:border-neutral-400"
    >
      <div>
        <p className="font-medium">
          <span
            className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: s.sportColor }}
          />
          {s.sportName}
          {s.cancelledAt && <span className="ml-2 text-xs text-red-600">отменен</span>}
        </p>
        <p className="text-sm text-neutral-500">{formatDateTimeShort(s.startTime)}</p>
      </div>
      <p className="text-sm text-neutral-700">
        записани {s.bookedCount}/{s.capacity}
        {s.waitingCount > 0 && ` · чакащи ${s.waitingCount}`}
      </p>
    </Link>
  );
}

export default async function InstructorHomePage() {
  const instructor = await getInstructorForSession();
  if (!instructor) notFound();
  const { upcoming, past } = await listInstructorSessions(instructor.id);

  return (
    <div>
      <h1 className="text-2xl font-bold">Моите часове</h1>

      <h2 className="mt-6 text-lg font-semibold">Предстоящи</h2>
      <div className="mt-2 space-y-2">
        {upcoming.length === 0 && <p className="text-sm text-neutral-500">Няма предстоящи часове.</p>}
        {upcoming.map((s) => (
          <Row key={s.id} s={s} />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Минали</h2>
      <div className="mt-2 space-y-2">
        {past.length === 0 && <p className="text-sm text-neutral-500">Няма минали часове.</p>}
        {past.map((s) => (
          <Row key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}

import { WEEKDAY_LABELS } from "@/lib/trainings";

type Opt = { id: number; name: string };
export type TemplateDefaults = {
  sportId?: number;
  instructorId?: number;
  weekday?: number;
  startTime?: string;
  durationMin?: number;
  capacity?: number;
  price?: string;
};

const input = "rounded-md border border-neutral-300 px-2 py-1.5";

// Shared by the create form (server) and the edit row (client): plain markup, no hooks.
export default function TemplateFields({
  sports,
  instructors,
  d = {},
}: {
  sports: Opt[];
  instructors: Opt[];
  d?: TemplateDefaults;
}) {
  return (
    <>
      <select name="sportId" aria-label="Тренировка" required defaultValue={d.sportId} className={input}>
        {sports.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select name="instructorId" aria-label="Инструктор" required defaultValue={d.instructorId} className={input}>
        {instructors.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <select name="weekday" aria-label="Ден от седмицата" required defaultValue={d.weekday ?? 1} className={input}>
        {WEEKDAY_LABELS.map((l, i) => (
          <option key={l} value={i + 1}>
            {l}
          </option>
        ))}
      </select>
      <input type="time" name="startTime" aria-label="Начало (София)" required defaultValue={d.startTime} className={input} />
      <input type="number" name="durationMin" min={1} aria-label="Продължителност (мин)" placeholder="Минути (по подр.)" defaultValue={d.durationMin} className={input} />
      <input type="number" name="capacity" min={1} aria-label="Капацитет" placeholder="Капацитет (по подр.)" defaultValue={d.capacity} className={input} />
      <input type="number" name="price" min={0} step="0.01" aria-label="Цена (€)" placeholder="Цена € (по подр.)" defaultValue={d.price} className={input} />
    </>
  );
}

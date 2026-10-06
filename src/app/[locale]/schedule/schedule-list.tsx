"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BookButton from "@/app/[locale]/sports/[slug]/book-button";
import WaitlistButton from "@/app/[locale]/sports/[slug]/waitlist-button";

export type CardData = {
  id: number;
  timeLabel: string;
  endLabel: string;
  dateLabel: string;
  durationMin: number;
  sportName: string;
  sportSlug: string;
  sportColor: string;
  levelLabel: string;
  instructorName: string;
  instructorSlug: string;
  spotsLeft: number;
  occupancy: "free" | "almost" | "full";
  priceLabel: string;
  waitingCount: number;
  booked: boolean;
  waitlistPosition: number | null;
};

// Text + icon, never colour alone.
export function useOccupancyText() {
  const t = useTranslations("occupancy");
  return (c: Pick<CardData, "occupancy" | "spotsLeft">) => {
    const places = t("places", { count: c.spotsLeft });
    if (c.occupancy === "free") return t("free", { places });
    if (c.occupancy === "almost") return t("almost", { places });
    return t("full");
  };
}

function OccupancyIcon({ occupancy }: { occupancy: CardData["occupancy"] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };
  if (occupancy === "free")
    return (
      <svg {...common}>
        <path d="M5 12l5 5L20 7" />
      </svg>
    );
  if (occupancy === "almost")
    return (
      <svg {...common}>
        <path d="M12 8v5M12 17h.01" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="5" y="11" width="14" height="9" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

const occupancyTone: Record<CardData["occupancy"], string> = {
  free: "text-accent-deep",
  almost: "text-amber-700",
  full: "text-ink/60",
};

export default function ScheduleList({
  cards,
  signedIn,
  focusSessionId,
  savedPhone,
}: {
  cards: CardData[];
  signedIn: boolean;
  // From ?session=: opens this session's bottom sheet on mount (sign-in return).
  focusSessionId?: number | null;
  // The signed-in user's phone, loaded on the server (null when none/signed out).
  savedPhone?: string | null;
}) {
  const t = useTranslations("schedule");
  const tDialog = useTranslations("dialog");
  const occupancyText = useOccupancyText();
  // ?session= opens that session's sheet straight away (sign-in return): the
  // id comes from the URL and never changes, so initial state is enough.
  const [selectedId, setSelectedId] = useState<number | null>(() =>
    focusSessionId != null && cards.some((c) => c.id === focusSessionId)
      ? focusSessionId
      : null
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = cards.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (selected && !d.open) d.showModal();
    if (!selected && d.open) d.close();
  }, [selected]);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setSelectedId(c.id)}
              aria-haspopup="dialog"
              className="card-lift flex min-h-11 w-full gap-4 border-l-4 bg-paper-dim p-4 text-left"
              style={{ borderLeftColor: c.sportColor }}
            >
              <span className="w-16 shrink-0">
                <span className="font-display block text-2xl leading-none">{c.timeLabel}</span>
                <span className="mt-1 block text-xs text-ink/60">{c.durationMin} {t("minutes")}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block truncate text-lg">{c.sportName}</span>
                <span className="mt-0.5 block truncate text-sm text-ink/70">
                  {c.instructorName} · {c.levelLabel}
                </span>
                <span
                  className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${occupancyTone[c.occupancy]}`}
                >
                  <OccupancyIcon occupancy={c.occupancy} />
                  {c.booked ? t("booked") : occupancyText(c)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-labelledby="schedule-dialog-title"
        onClose={() => setSelectedId(null)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setSelectedId(null);
        }}
        className="m-0 mt-auto max-h-[90vh] w-full max-w-none overflow-y-auto border-t-4 border-accent bg-paper p-0 text-ink backdrop:bg-ink/70 sm:m-auto sm:max-w-md sm:border-4"
      >
        {selected && (
          <div className="p-5 pb-8 sm:pb-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-block h-1.5 w-12" style={{ backgroundColor: selected.sportColor }} />
                <h2 id="schedule-dialog-title" className="font-display mt-2 text-3xl">
                  {selected.sportName}
                </h2>
                <p className="mt-1 text-sm capitalize text-ink/70">
                  {selected.dateLabel}, {selected.timeLabel} – {selected.endLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label={tDialog("close")}
                className="press flex h-11 w-11 shrink-0 items-center justify-center border border-ink/30 text-xl"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-ink/60">{tDialog("instructor")}</dt>
                <dd>
                  <Link
                    href={`/instructors/${selected.instructorSlug}`}
                    className="underline decoration-accent underline-offset-2"
                  >
                    {selected.instructorName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink/60">{tDialog("duration")}</dt>
                <dd>{selected.durationMin} {t("minutes")}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink/60">{tDialog("level")}</dt>
                <dd>{selected.levelLabel}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink/60">{tDialog("price")}</dt>
                <dd>{selected.priceLabel}</dd>
              </div>
            </dl>

            <p
              className={`mt-4 flex items-center gap-1.5 text-sm font-medium ${occupancyTone[selected.occupancy]}`}
            >
              <OccupancyIcon occupancy={selected.occupancy} />
              {occupancyText(selected)}
            </p>

            <div className="mt-5 flex flex-col items-stretch gap-3 [&_button]:min-h-11 [&_input]:min-h-11">
              {selected.booked ? (
                <p className="text-sm text-green-700">{tDialog("bookedForSession")}</p>
              ) : selected.spotsLeft > 0 ? (
                <BookButton
                  key={selected.id}
                  sessionId={selected.id}
                  disabled={false}
                  signedIn={signedIn}
                  label={tDialog("bookCta")}
                  savedPhone={savedPhone}
                />
              ) : (
                <WaitlistButton
                  key={selected.id}
                  sessionId={selected.id}
                  signedIn={signedIn}
                  waitingCount={selected.waitingCount}
                  position={selected.waitlistPosition}
                />
              )}
              <Link
                href={`/sports/${selected.sportSlug}`}
                className="flex min-h-11 items-center text-sm text-ink/70 underline underline-offset-2"
              >
                {tDialog("aboutTraining")}
              </Link>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

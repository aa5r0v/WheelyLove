"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { joinWaitlist, leaveWaitlist } from "./actions";

export default function WaitlistButton({
  sessionId,
  position,
  waitingCount,
}: {
  sessionId: number;
  position: number | null;
  waitingCount: number;
}) {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (id: number) => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action(sessionId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Възникна грешка. Опитай отново.");
      }
    });
  }

  function join() {
    if (!isSignedIn) {
      router.push("/sign-in");
      return;
    }
    run(joinWaitlist);
  }

  if (position !== null) {
    return (
      <div className="flex flex-col items-end gap-1 text-right">
        <p className="text-sm text-ink/70">
          Ти си №{position} в списъка за чакащи
        </p>
        <p className="text-xs text-ink/40">Ще ти пишем, ако се освободи място</p>
        <button
          onClick={() => run(leaveWaitlist)}
          disabled={pending}
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Зареждане…" : "Излез от списъка"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={join}
        disabled={pending}
        className="press font-display border border-ink px-5 py-2 text-sm tracking-wide transition-opacity disabled:opacity-50"
      >
        {pending ? "Зареждане…" : "Списък за чакащи"}
      </button>
      {waitingCount > 0 && (
        <p className="text-xs text-ink/40">{waitingCount} чакащи</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

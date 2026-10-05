"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

// Shown to signed-in users whose email is not verified yet: without verification
// they cannot book, and the original link may be long gone.
export default function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");

  async function resend() {
    setState("busy");
    await authClient.sendVerificationEmail({ email });
    setState("sent");
  }

  return (
    <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
      <p className="font-medium">
            Потвърди имейла си ({email}), за да можеш да резервираш тренировка.
      </p>
      {state === "sent" ? (
        <p className="mt-1 text-ink/60">Изпратихме нов линк — провери пощата си.</p>
      ) : (
        <button
          onClick={resend}
          disabled={state === "busy"}
          className="mt-1 text-accent-deep underline underline-offset-2 disabled:opacity-50"
        >
          {state === "busy" ? "Изпращане…" : "Изпрати нов линк за потвърждение"}
        </button>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      // After clicking the email link the user lands on /reset-password?token=…
      redirectTo: "/reset-password",
    });
    if (err) {
      setError("Възникна грешка. Опитай отново.");
      setLoading(false);
      return;
    }
    // Same answer for existing and non-existing addresses.
    setDone(true);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Забравена парола</h1>

      {done ? (
        <>
          <p className="mt-4 text-ink/60">
            Ако има профил с този имейл, изпратихме му линк за задаване на нова парола.
            Провери пощата си.
          </p>
          <Link
            href="/sign-in"
            className="font-display mt-8 inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
          >
            Обратно към входа
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-ink/60">
            Въведи имейла си — ще ти пратим линк, с който да зададеш нова парола.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium tracking-wide text-ink/60"
              >
                Имейл
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="press font-display w-full bg-accent px-5 py-2.5 text-sm tracking-wide text-accent-ink transition-opacity disabled:opacity-50"
            >
              {loading ? "Изпращане…" : "Изпрати линк"}
            </button>
          </form>
          <p className="mt-6 text-sm text-ink/60">
            <Link href="/sign-in" className="text-accent-deep underline underline-offset-2">
              Обратно към входа
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

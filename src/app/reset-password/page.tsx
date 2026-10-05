"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD = 10;

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Паролата трябва да е поне ${MIN_PASSWORD} символа.`);
      return;
    }
    if (password !== repeat) {
      setError("Двете пароли не съвпадат.");
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.resetPassword({
      newPassword: password,
      token: token ?? undefined,
    });
    if (err) {
      // The token is single-use and short-lived; asking for a fresh one is the fix.
      setError("Линкът е вече използван или е изтекъл. Заяви нов от „Забравена парола“.");
      setLoading(false);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <p className="mt-4 text-ink/60">
          Паролата е сменена. Влез с новата си парола — всички стари входи бяха прекратени.
        </p>
        <Link
          href="/sign-in"
          className="font-display mt-8 inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
        >
          Към входа
        </Link>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <p className="mt-4 text-ink/60">
          Липсва кодът от писмото. Отвори линка от имейла си или заяви нов от{" "}
          <Link href="/forgot-password" className="text-accent-deep underline underline-offset-2">
            „Забравена парола“
          </Link>
          .
        </p>
      </>
    );
  }

  return (
    <>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium tracking-wide text-ink/60"
          >
            Нова парола (поне {MIN_PASSWORD} символа)
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
          />
        </div>
        <div>
          <label
            htmlFor="repeat"
            className="block text-xs font-medium tracking-wide text-ink/60"
          >
            Повтори паролата
          </label>
          <input
            id="repeat"
            type="password"
            required
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="press font-display w-full bg-accent px-5 py-2.5 text-sm tracking-wide text-accent-ink transition-opacity disabled:opacity-50"
        >
          {loading ? "Запазване…" : "Запази новата парола"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Нова парола</h1>
      <Suspense fallback={<p className="mt-4 text-ink/50">Зареждане…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

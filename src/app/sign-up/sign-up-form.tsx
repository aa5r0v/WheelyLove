"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import GoogleButton from "@/app/google-button";

const MIN_PASSWORD = 10;

function errorText(code: string | null | undefined) {
  if (code === "PASSWORD_TOO_SHORT" || code === "INVALID_PASSWORD") {
    return `Паролата трябва да е поне ${MIN_PASSWORD} символа.`;
  }
  if (code === "INVALID_EMAIL") {
    return "Невалиден имейл адрес.";
  }
  return "Възникна грешка. Опитай отново.";
}

export default function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Паролата трябва да е поне ${MIN_PASSWORD} символа.`);
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.signUp.email({ name, email, password });
    if (err) {
      setError(errorText(err.code));
      setLoading(false);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.3em] text-accent">ПРОВЕРИ ИМЕЙЛА СИ</p>
        <h1 className="font-display mt-3 text-4xl">Почти готово!</h1>
        {/* One text for every outcome (registered or not): sign-up must not
            reveal whether the address already has an account. */}
        <p className="mt-4 text-ink/60">
          Ако имейлът е свободен, изпратихме ти линк за потвърждение. Потвърди го,
          за да можеш да резервираш тренировка.
        </p>
        <p className="mt-2 text-sm text-ink/50">
          Писмото не е стигнало? Влез отново с паролата си — ще ти изпратим нов линк.
        </p>
        <Link
          href="/"
          className="font-display mt-8 inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
        >
          Към началната страница
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">Регистрация</h1>
      <p className="mt-2 text-ink/60">
        Трябва ни само имейл и парола — за резервации и напомняния.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-medium tracking-wide text-ink/60">
            Име
          </label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-xs font-medium tracking-wide text-ink/60">
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
        <div>
          <label htmlFor="password" className="block text-xs font-medium tracking-wide text-ink/60">
            Парола (поне {MIN_PASSWORD} символа)
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="press font-display w-full bg-accent px-5 py-2.5 text-sm tracking-wide text-accent-ink transition-opacity disabled:opacity-50"
        >
          {loading ? "Създаване…" : "Създай профил"}
        </button>
      </form>

      {googleEnabled && (
        <div className="mt-6">
          <GoogleButton label="Регистрация с Google" />
        </div>
      )}

      <p className="mt-6 text-sm text-ink/60">
        Вече имаш профил?{" "}
        <Link href="/sign-in" className="text-accent-deep underline underline-offset-2">
          Вход
        </Link>
      </p>
    </div>
  );
}

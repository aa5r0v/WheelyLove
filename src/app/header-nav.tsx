"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function HeaderNav({
  user,
}: {
  user: { email: string; isAdmin: boolean } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <nav className="hidden items-center gap-5 text-sm font-medium sm:flex">
        <Link href="/gallery" className="hover:text-accent">
          Галерия
        </Link>
        <Link href="/my-bookings" className="hover:text-accent">
          Моите резервации
        </Link>
        {user?.isAdmin && (
          <Link href="/admin" className="hover:text-accent">
            Админ
          </Link>
        )}
        {user ? (
          <span className="flex items-center gap-3">
            <span className="max-w-40 truncate text-paper/70">{user.email}</span>
            <button
              onClick={signOut}
              disabled={busy}
              className="press font-display rounded-none border border-paper/40 px-4 py-2 text-sm tracking-wide text-paper transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Изход
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Link
              href="/sign-up"
              className="font-display px-2 py-2 text-sm tracking-wide text-paper/80 hover:text-accent"
            >
              Регистрация
            </Link>
            <Link
              href="/sign-in"
              className="press font-display rounded-none bg-accent px-4 py-2 text-sm tracking-wide text-accent-ink"
            >
              Вход
            </Link>
          </span>
        )}
      </nav>

      <div className="flex items-center gap-3 sm:hidden">
        {user ? (
          <button
            onClick={signOut}
            disabled={busy}
            className="press font-display border border-paper/40 px-3 py-1.5 text-sm tracking-wide text-paper disabled:opacity-50"
          >
            Изход
          </button>
        ) : (
          <Link
            href="/sign-in"
            className="press font-display bg-accent px-3 py-1.5 text-sm tracking-wide text-accent-ink"
          >
            Вход
          </Link>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Меню"
          aria-expanded={open}
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5"
        >
          <span
            className={`h-0.5 w-6 bg-paper transition-transform duration-150 ease-out ${open ? "translate-y-2 rotate-45" : ""}`}
          />
          <span
            className={`h-0.5 w-6 bg-paper transition-opacity duration-150 ease-out ${open ? "opacity-0" : ""}`}
          />
          <span
            className={`h-0.5 w-6 bg-paper transition-transform duration-150 ease-out ${open ? "-translate-y-2 -rotate-45" : ""}`}
          />
        </button>
      </div>

      <div
        data-open={open}
        inert={!open}
        className="mobile-menu absolute left-0 right-0 top-full border-b-2 border-accent bg-ink px-4 py-4 text-sm font-medium sm:hidden"
      >
        <div className="flex flex-col gap-4">
          <Link href="/gallery" onClick={() => setOpen(false)}>
            Галерия
          </Link>
          <Link href="/my-bookings" onClick={() => setOpen(false)}>
            Моите резервации
          </Link>
          {user?.isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)}>
              Админ
            </Link>
          )}
          {!user && (
            <Link href="/sign-up" onClick={() => setOpen(false)}>
              Регистрация
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

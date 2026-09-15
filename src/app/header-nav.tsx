"use client";

import { useState } from "react";
import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export default function HeaderNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="hidden items-center gap-5 text-sm font-medium sm:flex">
        <Link href="/gallery" className="hover:text-accent">
          Галерия
        </Link>
        <Link href="/my-bookings" className="hover:text-accent">
          Моите резервации
        </Link>
        <Show when="signed-in">
          <Link href="/admin" className="hover:text-accent">
            Админ
          </Link>
          <UserButton />
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="rounded-none bg-accent px-4 py-2 font-display text-sm tracking-wide text-accent-ink">
              Вход
            </button>
          </SignInButton>
        </Show>
      </nav>

      <div className="flex items-center gap-3 sm:hidden">
        <Show when="signed-in">
          <UserButton />
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="font-display bg-accent px-3 py-1.5 text-sm tracking-wide text-accent-ink">
              Вход
            </button>
          </SignInButton>
        </Show>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Меню"
          className="flex h-9 w-9 flex-col items-center justify-center gap-1.5"
        >
          <span
            className={`h-0.5 w-6 bg-paper transition ${open ? "translate-y-2 rotate-45" : ""}`}
          />
          <span
            className={`h-0.5 w-6 bg-paper transition ${open ? "opacity-0" : ""}`}
          />
          <span
            className={`h-0.5 w-6 bg-paper transition ${open ? "-translate-y-2 -rotate-45" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full border-b-2 border-accent bg-ink px-4 py-4 text-sm font-medium sm:hidden">
          <div className="flex flex-col gap-4">
            <Link href="/gallery" onClick={() => setOpen(false)}>
              Галерия
            </Link>
            <Link href="/my-bookings" onClick={() => setOpen(false)}>
              Моите резервации
            </Link>
            <Show when="signed-in">
              <Link href="/admin" onClick={() => setOpen(false)}>
                Админ
              </Link>
            </Show>
          </div>
        </div>
      )}
    </>
  );
}

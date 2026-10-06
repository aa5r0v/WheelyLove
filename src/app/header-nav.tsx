"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/i18n/navigation";
import LanguageSwitch from "./locale-switch";

// Единствен запълен CTA в хедъра: „Запиши час“. Всичко останало (вход,
// регистрация, профилни действия) са текстови/меню действия.
export default function HeaderNav({
  user,
}: {
  user: { email: string; isAdmin: boolean; isInstructor?: boolean } | null;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Затварянето връща фокуса на хамбургера: фокусът е бил преместен в
  // (вече отново inert) менюто и без това би паднал на <body>.
  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Escape затваря мобилното меню.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Фокусът отива в менюто при отваряне, за да е достижимо с клавиатура.
  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  async function signOut() {
    setBusy(true);
    await authClient.signOut();
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <nav className="hidden items-center gap-5 whitespace-nowrap text-sm font-medium xl:flex">
        <Link href="/#classes" className="hover:text-accent">
          {t("trainings")}
        </Link>
        <Link href="/schedule" className="hover:text-accent">
          {t("schedule")}
        </Link>
        <Link href="/instructors" className="hover:text-accent">
          {t("instructors")}
        </Link>
        <Link href="/gallery" className="hover:text-accent">
          {t("gallery")}
        </Link>
        <LanguageSwitch />
        {/* Always one click away from booking, on every page. */}
        <Link
          href="/schedule"
          className="press font-display rounded-none bg-accent px-4 py-2 text-sm tracking-wide text-accent-ink transition-colors hover:bg-accent-bright"
        >
          {t("bookNow")}
        </Link>
        {user ? (
          <AccountDisclosure email={user.email} isAdmin={user.isAdmin} isInstructor={user.isInstructor} onSignOut={signOut} busy={busy} />
        ) : (
          <span className="flex items-center gap-3">
            <Link
              href="/sign-up"
              className="font-display px-1 py-2 text-sm tracking-wide text-paper/80 hover:text-accent"
            >
              {t("signUp")}
            </Link>
            <Link
              href="/sign-in"
              className="font-display px-1 py-2 text-sm tracking-wide text-paper/80 hover:text-accent"
            >
              {t("signIn")}
            </Link>
          </span>
        )}
      </nav>

      <div className="flex items-center gap-2 xl:hidden">
        <LanguageSwitch />
        <button
          ref={triggerRef}
          onClick={() => setOpen((v) => !v)}
          aria-label={t("menu")}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="flex h-11 w-11 flex-col items-center justify-center gap-1.5"
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
        id="mobile-menu"
        ref={menuRef}
        tabIndex={-1}
        data-open={open}
        inert={!open}
        className="mobile-menu absolute left-0 right-0 top-full border-b-2 border-accent bg-ink px-4 py-4 text-sm font-medium xl:hidden"
      >
        <div className="flex flex-col gap-2">
          <Link
            href="/schedule"
            onClick={closeMenu}
            className="flex min-h-11 items-center font-display bg-accent px-4 text-accent-ink"
          >
            {t("bookNow")}
          </Link>
          <Link href="/#classes" onClick={closeMenu} className="flex min-h-11 items-center">
            {t("trainings")}
          </Link>
          <Link href="/schedule" onClick={closeMenu} className="flex min-h-11 items-center">
            {t("schedule")}
          </Link>
          <Link href="/instructors" onClick={closeMenu} className="flex min-h-11 items-center">
            {t("instructors")}
          </Link>
          <Link href="/gallery" onClick={closeMenu} className="flex min-h-11 items-center">
            {t("gallery")}
          </Link>
          {user ? (
            <>
              <Link href="/my-bookings" onClick={closeMenu} className="flex min-h-11 items-center">
                {t("myBookings")}
              </Link>
              {user.isInstructor && (
                <Link href="/instructor" onClick={closeMenu} className="flex min-h-11 items-center">
                  {t("myHours")}
                </Link>
              )}
              {user.isAdmin && (
                <Link href="/admin" onClick={closeMenu} className="flex min-h-11 items-center">
                  {t("admin")}
                </Link>
              )}
              <button
                onClick={signOut}
                disabled={busy}
                className="flex min-h-11 items-center text-left text-paper/70 hover:text-accent disabled:opacity-50"
              >
                {t("signOut")}
              </button>
            </>
          ) : (
            <>
              <Link href="/my-bookings" onClick={closeMenu} className="flex min-h-11 items-center">
                {t("myBookings")}
              </Link>
              <Link href="/sign-up" onClick={closeMenu} className="flex min-h-11 items-center">
                {t("signUp")}
              </Link>
              <Link href="/sign-in" onClick={closeMenu} className="flex min-h-11 items-center">
                {t("signIn")}
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Компактно профилно меню за десктопа: имейлът (съкратен) е бутон; вътре са
// пълният адрес, „Моите резервации“, панелите по роля и изходът.
function AccountDisclosure({
  email,
  isAdmin,
  isInstructor,
  onSignOut,
  busy,
}: {
  email: string;
  isAdmin: boolean;
  isInstructor?: boolean;
  onSignOut: () => Promise<void>;
  busy: boolean;
}) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Escape връща фокуса на бутона; клик вън затваря без да пипа фокуса.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Фокусът отива в първото действие на менюто при отваряне (ARIA menu);
  // Tab навън от менюто го затваря.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("a,button")?.focus();
  }, [open]);

  // Стрелките се движат между елементите на менюто (минават през края).
  function onMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("a,button") ?? []
    );
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  const item =
    "flex min-h-11 items-center px-3 text-paper/80 transition-colors hover:bg-paper/10 hover:text-accent";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("account")}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="account-menu"
        className="flex max-w-40 items-center gap-1 px-1 py-2 text-sm font-medium text-paper/80 transition-colors hover:text-accent"
      >
        <span className="truncate">{email}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 8"
          className={`h-2 w-3 shrink-0 text-paper/60 transition-transform duration-150 ease-out ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <div
        id="account-menu"
        ref={menuRef}
        tabIndex={-1}
        role="menu"
        aria-label={t("account")}
        data-open={open}
        inert={!open}
        onKeyDown={onMenuKeyDown}
        className="disclosure-menu absolute right-0 top-full w-72 whitespace-normal border-b-2 border-accent bg-ink py-2 text-sm font-medium"
      >
        <p className="break-all px-3 pb-2 pt-1 text-xs text-paper/60">{email}</p>
        <Link role="menuitem" href="/my-bookings" onClick={() => setOpen(false)} className={item}>
          {t("myBookings")}
        </Link>
        {isInstructor && (
          <Link role="menuitem" href="/instructor" onClick={() => setOpen(false)} className={item}>
            {t("myHours")}
          </Link>
        )}
        {isAdmin && (
          <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className={item}>
            {t("admin")}
          </Link>
        )}
        <button
          role="menuitem"
          onClick={onSignOut}
          disabled={busy}
          className={`${item} w-full text-left disabled:opacity-50`}
        >
          {t("signOut")}
        </button>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function BookingSuccessPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent">
        УСПЕХ
      </p>
      <h1 className="font-display mt-3 text-4xl">Плащането е получено</h1>
      <p className="mt-4 text-ink/60">
        Резервацията ти ще бъде потвърдена веднага след обработка на плащането.
        Можеш да провериш статуса в &quot;Моите резервации&quot;.
      </p>
      <Link
        href="/my-bookings"
        className="font-display mt-8 inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
      >
        Моите резервации
      </Link>
    </div>
  );
}

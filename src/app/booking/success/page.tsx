import Link from "next/link";

export default function BookingSuccessPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent">
        УСПЕХ
      </p>
      <h1 className="font-display mt-3 text-4xl">Мястото ти е запазено</h1>
      <p className="mt-4 text-ink/60">
        Плащането е на място в студиото — преди началото на тренировката. Ще ти
        пратим напомняне по имейл в деня преди тренировката.
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

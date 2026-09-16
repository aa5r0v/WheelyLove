import Link from "next/link";
import Image from "next/image";
import { getDb } from "@/db";
import { sports } from "@/db/schema";
import { Reveal, StaggerGrid } from "./reveal";

const sportImages: Record<string, string> = {
  spinning: "/spinning-studio.jpg",
};

export default async function HomePage() {
  const db = getDb();
  const allSports = await db.select().from(sports);

  return (
    <div>
      <section className="relative flex min-h-[70vh] items-end overflow-hidden border-b-2 border-accent bg-ink text-paper">
        <Image
          src="/hero-studio.png"
          alt="WheelyLove studio"
          fill
          priority
          className="object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        <Reveal className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-16 pt-24 sm:px-6">
          <h1 className="font-display mt-4 text-4xl leading-[0.95] sm:text-6xl">
            На колелото не ни задържат рекордите, а усещането за{" "}
            <span className="text-accent">щастие!</span>
          </h1>
          <p className="mt-6 max-w-md text-paper/80">
            Резервирай спининг, пилатес или steel training тренировка — избери
            час, инструктор и плати онлайн или на място.
          </p>
          <Link
            href="#classes"
            className="press font-display mt-8 inline-block bg-accent px-8 py-3 text-sm tracking-wide text-accent-ink transition-colors hover:bg-accent-bright"
          >
            Резервирай сега
          </Link>
        </Reveal>
      </section>

      <section id="classes" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal className="flex items-center gap-3">
          <span className="h-8 w-1.5 bg-accent" />
          <h2 className="font-display text-3xl">Тренировки</h2>
        </Reveal>
        <StaggerGrid className="mt-8 grid gap-6 sm:grid-cols-3">
          {allSports.map((sport) => (
            <Link
              key={sport.id}
              href={`/sports/${sport.slug}`}
              className="card-lift group block border-2 border-transparent bg-ink text-paper transition-[border-color] hover:border-accent"
            >
              <div className="placeholder-media relative aspect-[4/3] w-full overflow-hidden">
                {sportImages[sport.slug] ? (
                  <Image
                    src={sportImages[sport.slug]}
                    alt={sport.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <span className="absolute bottom-2 right-2 bg-ink/70 px-2 py-1 text-[10px] tracking-widest text-paper/60">
                    СНИМКА
                  </span>
                )}
              </div>
              <div className="p-5">
                <span className="inline-block h-1 w-10 bg-accent" />
                <h3 className="font-display mt-3 text-2xl">{sport.name}</h3>
                <p className="mt-1 text-sm text-paper/60">
                  {sport.description}
                </p>
                <span className="font-display mt-4 inline-block text-sm text-accent group-hover:underline">
                  Виж часовете →
                </span>
              </div>
            </Link>
          ))}
        </StaggerGrid>
      </section>

      <section className="border-y-2 border-accent bg-paper-dim px-4 py-16 sm:px-6">
        <Reveal className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl">Инструктори</h2>
          <p className="mt-2 max-w-lg text-ink/60">
            Всеки треньор има собствена визитка с био и контакти — виж я на
            страницата на всяка тренировка.
          </p>
          <Link
            href="/gallery"
            className="press font-display mt-6 inline-block border-2 border-ink bg-accent px-6 py-2.5 text-sm tracking-wide text-accent-ink transition-colors hover:bg-ink hover:text-paper"
          >
            Разгледай галерията
          </Link>
        </Reveal>
      </section>
    </div>
  );
}

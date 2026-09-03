import { getDb } from "../src/db";
import { instructors, sports } from "../src/db/schema";

async function main() {
  const db = getDb();

  await db
    .insert(sports)
    .values([
      {
        slug: "spinning",
        name: "Спининг",
        color: "#ef4444",
        description:
          "Интензивна кардио тренировка на велоергометър в ритъм на музика.",
      },
      {
        slug: "pilates",
        name: "Пилатес",
        color: "#10b981",
        description: "Контролирани движения за сила, стабилност и гъвкавост.",
      },
      {
        slug: "steel-training",
        name: "Steel Training",
        color: "#f59e0b",
        description:
          "Силова тренировка с тежести за издръжливост и тонус на цялото тяло.",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(instructors)
    .values([
      {
        slug: "ruzhi",
        name: "Ружи",
        bio: "Инструктор по спининг с фокус върху енергични, музикално водени тренировки.",
        email: "wheelylove@abv.bg",
        phone: "+359886573880",
        specialties: "Спининг",
      },
      {
        slug: "ani",
        name: "Ани",
        bio: "Пилатес инструктор, специализирана в контролирани движения за баланс и сила.",
        email: "wheelylove@abv.bg",
        phone: "+359886573880",
        specialties: "Пилатес",
      },
      {
        slug: "steel-coach",
        name: "Треньор Steel Training",
        bio: "Силова тренировка с фокус върху техника и прогресивно натоварване.",
        email: "wheelylove@abv.bg",
        phone: "+359886573880",
        specialties: "Steel Training",
      },
    ])
    .onConflictDoNothing();

  console.log("Seed complete.");
}

main().then(() => process.exit(0));

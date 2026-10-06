import { describe, expect, it } from "vitest";
import { sportDescription, sportName } from "./sport-content";

// Точно съдържанието от scripts/seed.ts — единственото, което превеждаме.
describe("sportName", () => {
  it("translates the seeded names on /en", () => {
    expect(sportName("Спининг", "en")).toBe("Spinning");
    expect(sportName("Пилатес", "en")).toBe("Pilates");
  });

  it("keeps the original on bg and for unknown (studio-edited) names", () => {
    expect(sportName("Спининг", "bg")).toBe("Спининг");
    expect(sportName("Спининг за напреднали", "en")).toBe("Спининг за напреднали");
    expect(sportName("Steel Training", "en")).toBe("Steel Training");
  });
});

describe("sportDescription", () => {
  it("translates the seeded descriptions on /en", () => {
    expect(
      sportDescription("Интензивна кардио тренировка на велоергометър в ритъм на музика.", "en")
    ).toBe("An intense cardio workout on a stationary bike, riding to the rhythm of the music.");
    expect(sportDescription("Контролирани движения за сила, стабилност и гъвкавост.", "en")).toBe(
      "Controlled movements for strength, stability and flexibility."
    );
    expect(
      sportDescription("Силова тренировка с тежести за издръжливост и тонус на цялото тяло.", "en")
    ).toBe("Strength training with weights for full-body endurance and tone.");
  });

  it("never invents a translation for edited content and keeps bg untouched", () => {
    const edited = "Нашата нова интервална тренировка (променена от студиото).";
    expect(sportDescription(edited, "en")).toBe(edited);
    expect(sportDescription(edited, "bg")).toBe(edited);
    expect(
      sportDescription("Контролирани движения за сила, стабилност и гъвкавост.", "bg")
    ).toBe("Контролирани движения за сила, стабилност и гъвкавост.");
    expect(sportDescription(null, "en")).toBeNull();
  });
});

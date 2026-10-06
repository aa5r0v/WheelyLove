import { describe, it, expect } from "vitest";
import { resendOutcomeText } from "./resend-outcome";

// Pins down the exact strings VerifyEmailBanner renders: a failed resend must
// never claim the letter was sent.
describe("resendOutcomeText", () => {
  it("announces the new link only on success", () => {
    expect(resendOutcomeText(true)).toContain("Изпратихме нов линк");
  });

  it("says nothing about a sent link on error (plain failure)", () => {
    const text = resendOutcomeText(false, 500);
    expect(text).not.toContain("Изпратихме");
    expect(text).not.toContain("изпратихме");
  });

  it("says nothing about a sent link on error (429 rate limit)", () => {
    const text = resendOutcomeText(false, 429);
    expect(text).not.toContain("Изпратихме");
    expect(text).not.toContain("изпратихме");
    expect(text).toContain("Твърде много опити");
  });
});

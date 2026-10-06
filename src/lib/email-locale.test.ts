import { describe, it, expect, beforeEach, vi } from "vitest";

// The Resend SDK is mocked at the module level (no real delivery, ever).
const resendSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => {
  class Resend {
    emails = { send: resendSend };
  }
  return { Resend };
});

process.env.RESEND_API_KEY ||= "test-only-resend-key";

import {
  sendBookingCancelledEmail,
  sendBookingConfirmationEmail,
  sendBookingReminderEmail,
  sendExistingAccountEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWaitlistSpotOpenEmail,
} from "./email";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wheelylove.net";

const info = {
  to: "someone@example.com",
  sessionId: 311,
  sportName: "Spinning",
  instructorName: "Ивайло",
  startTime: new Date("2026-11-01T18:00:00Z"),
  endTime: new Date("2026-11-01T18:45:00Z"),
};

function sent() {
  const call = resendSend.mock.calls[0];
  return { subject: String(call[0].subject), html: String(call[0].html) };
}

beforeEach(() => {
  resendSend.mockReset();
  resendSend.mockResolvedValue({ data: { id: "abc" }, error: null });
});

describe("booking letters in English", () => {
  it("the confirmation is fully English and links the /en pages", async () => {
    await sendBookingConfirmationEmail({ ...info, locale: "en" });
    const { subject, html } = sent();
    // "accepted", not "confirmed": плащането е на място, статусът е pending
    expect(subject).toContain("Your booking has been accepted: Spinning");
    expect(subject).not.toContain("confirmed");
    expect(html).toContain("Your booking has been accepted 🎉");
    expect(html).toContain("Payment is on site");
    expect(html).toContain(`${SITE_URL}/en/my-bookings`);
    // футерът на английско писмо води към /en, не към корена
    expect(html).toContain(`WheelyLove · <a href="${SITE_URL}/en"`);
    expect(html).not.toContain(`href="${SITE_URL}"`);
    expect(html).toContain(`/api/calendar/session/311?l=en`);
    expect(html).not.toContain("Резервацията");
  });

  it("the reminder is fully English", async () => {
    await sendBookingReminderEmail({ ...info, locale: "en" });
    const { subject, html } = sent();
    expect(subject).toContain("Reminder: Spinning");
    expect(html).toContain("See you soon! 🚴");
    expect(html).toContain(`${SITE_URL}/en/my-bookings`);
  });

  it("the waitlist notice is English and keeps the given bookUrl", async () => {
    await sendWaitlistSpotOpenEmail({
      to: info.to,
      sportName: "Pilates",
      startTime: info.startTime,
      bookUrl: `${SITE_URL}/en/sports/pilates`,
      locale: "en",
    });
    const { subject, html } = sent();
    expect(subject).toContain("A spot opened up: Pilates");
    expect(html).toContain("A spot opened up!");
    expect(html).toContain(`${SITE_URL}/en/sports/pilates`);
  });

  it("cancellations are English for both reasons", async () => {
    await sendBookingCancelledEmail({
      to: info.to,
      sportName: "Spinning",
      startTime: info.startTime,
      reason: "session",
      locale: "en",
    });
    expect(sent().html).toContain("This class is cancelled");

    resendSend.mockClear();
    await sendBookingCancelledEmail({
      to: info.to,
      sportName: "Spinning",
      startTime: info.startTime,
      reason: "booking",
      locale: "en",
    });
    expect(sent().html).toContain("Your booking is cancelled");
    expect(sent().html).toContain(`${SITE_URL}/en/#schedule`);
  });
});

describe("auth letters in English", () => {
  it("verification, reset and existing-account letters follow the locale", async () => {
    await sendVerificationEmail({ to: info.to, url: "https://x/verify", locale: "en" });
    expect(sent().subject).toBe("Confirm your email in WheelyLove");
    expect(sent().html).toContain("Welcome to WheelyLove! 🎉");

    resendSend.mockClear();
    await sendPasswordResetEmail({ to: info.to, url: "https://x/reset", locale: "en" });
    expect(sent().subject).toBe("Set a new password in WheelyLove");
    expect(sent().html).toContain("Password change");
    expect(sent().html).toContain("https://x/reset");

    resendSend.mockClear();
    await sendExistingAccountEmail({ to: info.to, locale: "en" });
    expect(sent().subject).toBe("You already have a WheelyLove account");
    expect(sent().html).toContain(`${SITE_URL}/en/forgot-password`);
  });
});

describe("default stays Bulgarian when no locale is given", () => {
  it("the confirmation without locale is the Bulgarian letter", async () => {
    await sendBookingConfirmationEmail(info);
    const { subject, html } = sent();
    expect(subject).toContain("Резервацията ти е приета");
    expect(html).toContain("Резервацията ти е приета 🎉");
    expect(html).toContain(`${SITE_URL}/my-bookings`);
    expect(html).toContain(`/api/calendar/session/311?l=bg`);
    // българският футер води към корена
    expect(html).toContain(`WheelyLove · <a href="${SITE_URL}"`);
    expect(html).not.toContain(`href="${SITE_URL}/en"`);
  });
});

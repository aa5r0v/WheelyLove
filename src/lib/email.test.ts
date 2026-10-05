import { describe, it, expect, beforeEach, vi } from "vitest";

// The Resend SDK is mocked at the module level: the app only sees
// { data, error } from emails.send().
const resendSend = vi.hoisted(() => vi.fn());
vi.mock("resend", () => {
  class Resend {
    emails = { send: resendSend };
  }
  return { Resend };
});

process.env.RESEND_API_KEY ||= "test-only-resend-key";

import {
  sendBookingConfirmationEmail,
  sendBookingReminderEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./email";
import { STUDIO_DIRECTIONS_URL } from "./studio";

const RESEND_ERROR = { message: "rejected", name: "some_error" };

function ok() {
  resendSend.mockResolvedValue({ data: { id: "abc" }, error: null });
}
function failed() {
  resendSend.mockResolvedValue({ data: null, error: RESEND_ERROR });
}

const info = {
  to: "someone@example.com",
  sessionId: 311,
  sportName: "Spinning",
  instructorName: "Ивайло",
  startTime: new Date("2026-11-01T18:00:00Z"),
  endTime: new Date("2026-11-01T18:45:00Z"),
};

beforeEach(() => {
  resendSend.mockReset();
});

describe("auth emails fail loudly", () => {
  it("sendVerificationEmail throws when Resend reports an error", async () => {
    failed();
    await expect(
      sendVerificationEmail({ to: info.to, url: "https://x/verify" })
    ).rejects.toThrow();
  });

  it("sendPasswordResetEmail throws when Resend reports an error", async () => {
    failed();
    await expect(
      sendPasswordResetEmail({ to: info.to, url: "https://x/reset" })
    ).rejects.toThrow();
  });

  it("the failure is logged with the [email:FAILED] marker and a masked address", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    failed();
    await expect(
      sendVerificationEmail({ to: "someone@example.com", url: "https://x/verify" })
    ).rejects.toThrow();
    const calls = spy.mock.calls.map((c) => c.map(String).join(" "));
    spy.mockRestore();
    expect(
      calls.some((line) => line.includes("[email:FAILED]") && line.includes("verification"))
    ).toBe(true);
    // The full address must not appear anywhere in the log.
    expect(calls.some((line) => line.includes("someone@example.com"))).toBe(false);
  });
});

describe("transactional emails keep the swallow behaviour", () => {
  it("a booking confirmation does NOT throw on a Resend error, but logs the marker", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    failed();
    await expect(sendBookingConfirmationEmail(info)).resolves.toBeUndefined();
    const calls = spy.mock.calls.map((c) => c.map(String).join(" "));
    spy.mockRestore();
    expect(
      calls.some(
        (line) =>
          line.includes("[email:FAILED]") && line.includes("booking-confirmation")
      )
    ).toBe(true);
  });

  it("sends normally when Resend succeeds", async () => {
    ok();
    await expect(sendBookingConfirmationEmail(info)).resolves.toBeUndefined();
    expect(resendSend).toHaveBeenCalledTimes(1);
  });
});

describe("booking letters carry the place and the calendar/navigation links", () => {
  const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wheelylove.net";

  function sentHtml(): string {
    const call = resendSend.mock.calls[0];
    return String(call[0].html);
  }

  it("the confirmation links Google Calendar, the .ics and the directions", async () => {
    ok();
    await sendBookingConfirmationEmail(info);
    const html = sentHtml();
    expect(html).toContain("https://calendar.google.com/calendar/render");
    expect(html).toContain("dates=20261101T180000Z");
    expect(html).toContain(`${SITE_URL}/api/calendar/session/311`);
    expect(html).toContain(STUDIO_DIRECTIONS_URL);
    expect(html).toContain("Kavarna City Center, Каварна");
  });

  it("the reminder links the same three destinations", async () => {
    ok();
    await sendBookingReminderEmail(info);
    const html = sentHtml();
    expect(html).toContain("https://calendar.google.com/calendar/render");
    expect(html).toContain(`${SITE_URL}/api/calendar/session/311`);
    expect(html).toContain(STUDIO_DIRECTIONS_URL);
  });
});

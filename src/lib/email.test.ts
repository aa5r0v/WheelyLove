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
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./email";

const RESEND_ERROR = { message: "rejected", name: "some_error" };

function ok() {
  resendSend.mockResolvedValue({ data: { id: "abc" }, error: null });
}
function failed() {
  resendSend.mockResolvedValue({ data: null, error: RESEND_ERROR });
}

const info = {
  to: "someone@example.com",
  sportName: "Spinning",
  instructorName: "Ивайло",
  startTime: new Date("2026-11-01T18:00:00Z"),
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

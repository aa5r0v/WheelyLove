import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));
const resendSend = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({ default: { createTransport } }));
vi.mock("resend", () => {
  class Resend {
    emails = { send: resendSend };
  }
  return { Resend };
});

const ENV = { ...process.env };

async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ENV, ...env };
  return import("./email");
}

describe("email transport: SMTP (Gmail relay) when SMTP_HOST is set", () => {
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
    resendSend.mockReset();
  });
  afterEach(() => {
    process.env = { ...ENV };
  });

  it("sends through SMTP from EMAIL_FROM, never through Resend", async () => {
    sendMail.mockResolvedValue({ messageId: "<x@relay>" });
    const m = await load({
      SMTP_HOST: "smtp-relay.gmail.com",
      SMTP_PORT: "587",
      EMAIL_FROM: "Your Wheely <adelina@purepoint.bg>",
      NEXT_PUBLIC_APP_URL: "https://wheelylove.purepoint.bg",
    });
    await m.sendVerificationEmail({ to: "client@example.com", url: "https://x/verify" });
    expect(resendSend).not.toHaveBeenCalled();
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp-relay.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        name: "wheelylove.purepoint.bg",
        auth: undefined,
      })
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Your Wheely <adelina@purepoint.bg>", to: "client@example.com" })
    );
  });

  it("an SMTP failure on an auth letter throws and logs the marker", async () => {
    sendMail.mockRejectedValue(new Error("550 relay denied"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await load({ SMTP_HOST: "smtp-relay.gmail.com", EMAIL_FROM: "Your Wheely <adelina@purepoint.bg>" });
    await expect(m.sendVerificationEmail({ to: "client@example.com", url: "https://x/v" })).rejects.toThrow();
    const lines = spy.mock.calls.map((c) => c.map(String).join(" "));
    spy.mockRestore();
    expect(lines.some((l) => l.includes("[email:FAILED]"))).toBe(true);
    expect(lines.some((l) => l.includes("client@example.com"))).toBe(false);
  });

  it("without SMTP_HOST it still uses Resend", async () => {
    resendSend.mockResolvedValue({ data: { id: "r1" }, error: null });
    const m = await load({ SMTP_HOST: "", RESEND_API_KEY: "test-only", RESEND_EMAIL_DOMAIN: "wheelylove.net" });
    await m.sendVerificationEmail({ to: "client@example.com", url: "https://x/v" });
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "Your Wheely <reservations@wheelylove.net>", to: ["client@example.com"] })
    );
    expect(createTransport).not.toHaveBeenCalled();
  });
});

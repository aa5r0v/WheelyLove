import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn(async () => {}),
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendExistingAccountEmail: vi.fn(async () => {}),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { googleCredentials, isGoogleEnabled } from "@/lib/google-auth";

const KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// auth.ts reads the environment when it is loaded, so every case imports a fresh copy.
async function freshAuth(env: Record<string, string | undefined>) {
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
  process.env.BETTER_AUTH_SECRET ||= "test-only-secret-0123456789abcdef0123456789abcdef";
  vi.resetModules();
  const { getAuth } = await import("@/lib/auth");
  return getAuth();
}

describe("googleCredentials / isGoogleEnabled", () => {
  it("needs both variables", () => {
    expect(isGoogleEnabled({})).toBe(false);
    expect(isGoogleEnabled({ GOOGLE_CLIENT_ID: "id" })).toBe(false);
    expect(isGoogleEnabled({ GOOGLE_CLIENT_SECRET: "s" })).toBe(false);
    expect(isGoogleEnabled({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "s" })).toBe(false);
    expect(isGoogleEnabled({ GOOGLE_CLIENT_ID: "  ", GOOGLE_CLIENT_SECRET: "s" })).toBe(false);
    expect(googleCredentials({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" })).toEqual({
      clientId: "id",
      clientSecret: "s",
    });
  });
});

describe("Better Auth configuration", { timeout: 30_000 }, () => {
  it("without the variables the Google provider does not exist", async () => {
    const auth = await freshAuth({});
    const ctx = await auth.$context;
    expect(ctx.socialProviders.map((p) => p.id)).not.toContain("google");
    await expect(
      auth.api.signInSocial({ body: { provider: "google", callbackURL: "/" } })
    ).rejects.toThrow();
  });

  it("with only one of the variables the provider does not exist", async () => {
    const auth = await freshAuth({ GOOGLE_CLIENT_ID: "only-id" });
    const ctx = await auth.$context;
    expect(ctx.socialProviders.map((p) => p.id)).not.toContain("google");
  });

  it("with both variables Google is configured, redirects to Google with the production callback, and nothing is trusted implicitly", async () => {
    const auth = await freshAuth({
      GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "test-secret",
      BETTER_AUTH_URL: "https://wheelylove.purepoint.bg",
    });
    const ctx = await auth.$context;
    expect(ctx.socialProviders.map((p) => p.id)).toContain("google");
    expect(ctx.trustedProviders).toEqual([]);

    const res = await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/" } });
    const url = new URL(res.url!);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("test-client-id.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://wheelylove.purepoint.bg/api/auth/callback/google"
    );
  });
});

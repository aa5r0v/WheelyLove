import { afterEach, beforeEach, expect, it, vi } from "vitest";

const location = { href: "http://localhost:3000/en/sign-in", origin: "http://localhost:3000" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  location.href = "http://localhost:3000/en/sign-in";
  fetchMock.mockReset();
  vi.stubGlobal("window", { location });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

it("keeps password-login navigation in the form while preserving the verification callback", async () => {
  const callbackURL = "/en/sign-in?verified=1&next=%2Fen%2Fschedule%3Fsession%3D7";
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ redirect: true, url: callbackURL }), {
    headers: { "content-type": "application/json" },
  }));
  const { emailAuthClient } = await import("./auth-client");
  const result = await emailAuthClient.signIn.email({
    email: "synthetic@example.invalid", password: "synthetic-password", callbackURL,
  });

  expect(result.error).toBeNull();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).callbackURL).toBe(callbackURL);
  expect(location.href).toBe("http://localhost:3000/en/sign-in");
});

it("retains the default browser redirect for Google sign-in", async () => {
  const providerURL = "https://accounts.example.invalid/oauth";
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ redirect: true, url: providerURL }), {
    headers: { "content-type": "application/json" },
  }));
  const { authClient } = await import("./auth-client");
  await authClient.signIn.social({ provider: "google", callbackURL: "/en/schedule" });

  expect(location.href).toBe(providerURL);
});

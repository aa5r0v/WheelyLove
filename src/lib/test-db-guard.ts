// Wired in as a vitest setupFile (see vitest.config.ts): the suite creates and
// deletes real rows (users, bookings, sessions), so it must refuse to start
// unless DATABASE_URL points at a local or *_test database.

export function isLocalOrTestDatabase(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).toLowerCase();
  // new URL().hostname keeps the brackets for IPv6 ("[::1]").
  const localHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
  return localHosts.includes(host) || dbName.endsWith("_test");
}

const url = process.env.DATABASE_URL ?? "";
if (!isLocalOrTestDatabase(url)) {
  const masked = url.replace(/\/\/[^@]*@/, "//***@");
  throw new Error(
    `REFUSING TO RUN TESTS: DATABASE_URL (${masked}) is not a local or *_test database. ` +
      "The suite writes and deletes real rows (users, bookings). " +
      "Point .env.local at localhost or a database whose name ends in _test."
  );
}

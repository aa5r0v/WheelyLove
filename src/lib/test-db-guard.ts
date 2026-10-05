// Wired in as a vitest setupFile (see vitest.config.ts): the suite creates and
// deletes real rows (users, bookings, sessions), so it must refuse to start
// unless the DATABASE_URL database NAME ends in _test. The host does not
// matter: localhost is NOT enough, because an SSH tunnel to a production
// database also points at localhost.

export function isTestDatabase(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, "")).toLowerCase();
  return dbName.endsWith("_test");
}

const url = process.env.DATABASE_URL ?? "";
if (!isTestDatabase(url)) {
  const masked = url.replace(/\/\/[^@]*@/, "//***@");
  throw new Error(
    `REFUSING TO RUN TESTS: the database in DATABASE_URL (${masked}) does not end in _test. ` +
      "The suite writes and deletes real rows (users, bookings). " +
      "Point .env.local at a database whose name ends in _test (localhost alone is not enough)."
  );
}

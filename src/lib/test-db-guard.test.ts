import { describe, it, expect } from "vitest";
import { isTestDatabase } from "./test-db-guard";

// The suite writes and deletes real rows, so the guard must only ever accept a
// database whose NAME ends in _test - localhost alone is NOT enough, because
// an SSH tunnel to a production database also looks like localhost.
describe("isTestDatabase", () => {
  it("accepts a *_test database name regardless of host", () => {
    expect(isTestDatabase("postgres://u:p@localhost:5432/wheelylove_test")).toBe(true);
    expect(isTestDatabase("postgres://u:p@127.0.0.1:5432/app_test")).toBe(true);
    expect(isTestDatabase("postgres://u:p@[::1]:5432/db_test")).toBe(true);
    expect(isTestDatabase("postgres://u:p@db:5432/wheelylove_test")).toBe(true);
    expect(isTestDatabase("postgres://u:p@some-host.example.com:5432/app_test")).toBe(true);
  });

  it("rejects a non-_test name even on localhost", () => {
    expect(isTestDatabase("postgres://u:p@localhost:5432/wheelylove")).toBe(false);
    expect(isTestDatabase("postgres://u:p@127.0.0.1:5432/wheelylove")).toBe(false);
  });

  it("rejects anything that looks like production", () => {
    expect(isTestDatabase("postgres://u:p@db:5432/wheelylove")).toBe(false);
    expect(
      isTestDatabase("postgres://u:p@prod-db.example.com:5432/wheelylove")
    ).toBe(false);
  });

  it("rejects garbage and empty values", () => {
    expect(isTestDatabase("")).toBe(false);
    expect(isTestDatabase("not-a-url")).toBe(false);
  });
});

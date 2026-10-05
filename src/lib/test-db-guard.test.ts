import { describe, it, expect } from "vitest";
import { isLocalOrTestDatabase } from "./test-db-guard";

// The tests only ever run against localhost/_test (the setup file enforces it);
// these cases pin down what the guard accepts and, more importantly, rejects.
describe("isLocalOrTestDatabase", () => {
  it("accepts localhost / loopback hosts", () => {
    expect(isLocalOrTestDatabase("postgres://u:p@localhost:5432/wheelylove")).toBe(true);
    expect(isLocalOrTestDatabase("postgres://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(isLocalOrTestDatabase("postgres://u:p@[::1]:5432/db")).toBe(true);
  });

  it("accepts a *_test database name regardless of host", () => {
    expect(isLocalOrTestDatabase("postgres://u:p@db:5432/wheelylove_test")).toBe(true);
    expect(isLocalOrTestDatabase("postgres://u:p@some-host.example.com:5432/app_test")).toBe(true);
  });

  it("rejects anything that looks like production", () => {
    expect(isLocalOrTestDatabase("postgres://u:p@db:5432/wheelylove")).toBe(false);
    expect(
      isLocalOrTestDatabase("postgres://u:p@prod-db.example.com:5432/wheelylove")
    ).toBe(false);
  });

  it("rejects garbage and empty values", () => {
    expect(isLocalOrTestDatabase("")).toBe(false);
    expect(isLocalOrTestDatabase("not-a-url")).toBe(false);
  });
});

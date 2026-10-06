import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The admin layout alone does not protect the data: Next.js still renders the
// page segment and ships its data in the RSC payload. So EVERY admin page must
// call requireAdminPage() as the first statement of its default export,
// before any data is loaded. This test fails for any new page that forgets it.
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === "page.tsx" ? [p] : [];
  });
}

describe("admin pages guard", () => {
  const files = pages(path.resolve(__dirname));

  it("finds the admin pages", () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
  });

  it.each(files)("%s calls requireAdminPage() first", (f) => {
    const src = readFileSync(f, "utf8");
    const m = src.match(/export default async function \w+\([^)]*\)\s*\{([\s\S]*)/);
    expect(m, "default export must be an async function").not.toBeNull();
    const firstStatement =
      m![1]
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("//")) ?? "";
    expect(firstStatement).toBe("await requireAdminPage();");
  });
});

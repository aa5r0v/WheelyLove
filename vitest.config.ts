import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Fails the run before any test if the DATABASE_URL database name does
    // not end in _test (the suite writes real rows; localhost is not enough).
    setupFiles: ["./src/lib/test-db-guard.ts"],
    // .next/standalone (after `npm run build`) contains a copy of the sources,
    // including the tests - never run those duplicates.
    exclude: ["**/node_modules/**", "**/dist/**", ".next/**"],
  },
});

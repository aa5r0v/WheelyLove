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
    // Fails the run before any test if DATABASE_URL is not local/*_test
    // (the suite writes real rows).
    setupFiles: ["./src/lib/test-db-guard.ts"],
    // .next/standalone (after `npm run build`) contains a copy of the sources,
    // including the tests - never run those duplicates.
    exclude: ["**/node_modules/**", "**/dist/**", ".next/**"],
  },
});

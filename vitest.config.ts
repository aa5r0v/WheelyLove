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
    // .next/standalone (after `npm run build`) contains a copy of the sources,
    // including the tests - never run those duplicates.
    exclude: ["**/node_modules/**", "**/dist/**", ".next/**"],
  },
});

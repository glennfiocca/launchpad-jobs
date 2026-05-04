import { defineConfig } from "vitest/config";
import path from "node:path";

// Minimal vitest config — wires up the `@/` path alias used throughout the
// codebase so source files that import via `@/lib/...` resolve correctly.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Playwright e2e specs live under e2e/ and use a different runner.
    // Vitest must skip them or it will error on `test.skip()` outside
    // a describe block (Playwright vs Vitest API mismatch).
    exclude: ["e2e/**", "node_modules/**", "dist/**", ".next/**"],
  },
});

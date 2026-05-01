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
});

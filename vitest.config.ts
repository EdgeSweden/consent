import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  // Mirrors tsup.config.ts (decision #33).
  define: { __PACKAGE_VERSION__: JSON.stringify(pkg.version) },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});

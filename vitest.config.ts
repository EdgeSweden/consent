import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  // Mirrors tsup.config.ts (decision #33).
  define: { __PACKAGE_VERSION__: JSON.stringify(pkg.version) },
  // The adapters import the core by its package name (decision #42); resolve it to the source so a
  // test shares one module graph with them.
  resolve: {
    alias: [
      {
        find: /^@edgesweden\/consent$/,
        replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});

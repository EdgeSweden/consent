import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  entry: {
    index: "src/index.ts",
    gate: "src/gate/index.ts",
    astro: "src/astro/index.ts",
    styles: "src/styles.css",
  },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  dts: {
    entry: { index: "src/index.ts", gate: "src/gate/index.ts", astro: "src/astro/index.ts" },
  },
  clean: true,
  treeshake: true,
  // Each entry is self-contained, so a budget never misses a shared chunk (plan: Size budget).
  splitting: false,
  // The adapters share the core's one consent state through the package entry (decision #42).
  external: ["@edgesweden/consent"],
  // `packageVersion` in the record payload (decision #33).
  define: { __PACKAGE_VERSION__: JSON.stringify(pkg.version) },
  // The size budget is measured on dist (plan: Size budget).
  minify: true,
});

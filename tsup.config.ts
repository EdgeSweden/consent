import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", astro: "src/astro/index.ts", styles: "src/styles.css" },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  dts: { entry: { index: "src/index.ts", astro: "src/astro/index.ts" } },
  clean: true,
  treeshake: true,
  // The size budget is measured on dist (plan: Size budget).
  minify: true,
});

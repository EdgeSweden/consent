import { copyFile } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", astro: "src/astro/index.ts" },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  dts: true,
  clean: true,
  treeshake: true,
  async onSuccess() {
    await copyFile("src/styles.css", "dist/styles.css");
  },
});

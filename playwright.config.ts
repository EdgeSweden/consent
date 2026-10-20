import { defineConfig, devices } from "@playwright/test";

// Runs against the built demo (`pnpm demo:build`), one preview server per banner variant; the
// ports match BLOCKING and NON_BLOCKING in test/e2e/fixtures.ts.

const preview = (port: number, variant: string) => ({
  command: `pnpm exec astro preview --root examples/astro --port ${port}`,
  url: `http://localhost:${port}/`,
  env: { DEMO_VARIANT: variant, ASTRO_TELEMETRY_DISABLED: "1" },
  // Never attach to whatever else is listening on the port.
  reuseExistingServer: false,
});

export default defineConfig({
  testDir: "test/e2e",
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4391" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [preview(4391, "blocking"), preview(4392, "non-blocking")],
});

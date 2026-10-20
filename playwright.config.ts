import { defineConfig, devices } from "@playwright/test";

// The demo site and its webServer entry arrive with P1.7.
export default defineConfig({
  testDir: "test/e2e",
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

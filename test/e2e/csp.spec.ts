// The zero-violation fixture only means something while a strict policy is in force (plan: CSP,
// Demo): both demo variants must carry one, without 'unsafe-inline' or 'unsafe-eval'.
import { BLOCKING, NON_BLOCKING, expect, pages, test } from "./fixtures.js";

const paths = [...Object.values(pages.en.pages), ...Object.values(pages.sv.pages)].map(
  (p) => p.path,
);

for (const origin of [BLOCKING, NON_BLOCKING]) {
  for (const path of paths) {
    test(`${origin}${path} enforces a strict CSP`, async ({ page }) => {
      await page.goto(`${origin}${path}`);
      const policies = await page
        .locator('meta[http-equiv="content-security-policy" i]')
        .evaluateAll((metas) => metas.map((m) => m.getAttribute("content") ?? ""));
      expect(policies).toHaveLength(1);
      const directives = new Map(
        (policies[0] ?? "")
          .split(";")
          .map((d) => d.trim().split(/\s+/))
          .filter(([name]) => name)
          .map(([name, ...sources]) => [name ?? "", sources]),
      );
      for (const name of ["script-src", "style-src"]) {
        const sources = directives.get(name);
        expect(sources, name).toBeDefined();
        expect(sources).toContain("'self'");
        for (const source of sources ?? []) {
          expect(source, `${name} ${source}`).toMatch(/^('self'|'sha256-[A-Za-z0-9+/]+=*')$/);
        }
      }
    });
  }
}

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The CSP and dependency bans are a safety net for the browser bundles; make sure each one fires.
const eslint = new ESLint();

async function ruleIds(code: string, filePath = "src/core/probe.ts"): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? "fatal");
}

describe("browser bundle lint rules", () => {
  it.each([
    ["innerHTML", "document.body.innerHTML = '<b>x</b>';", "no-restricted-properties"],
    ["outerHTML", "document.body.outerHTML = '';", "no-restricted-properties"],
    [
      "insertAdjacentHTML",
      "document.body.insertAdjacentHTML('beforeend', '');",
      "no-restricted-properties",
    ],
    ["cssText", "document.body.style.cssText = 'color: red';", "no-restricted-properties"],
    ["document.write", "document.write('x');", "no-restricted-properties"],
    [
      "setAttribute style",
      "document.body.setAttribute('style', 'color: red');",
      "no-restricted-syntax",
    ],
    [
      "setAttribute style template",
      "document.body.setAttribute(`style`, '');",
      "no-restricted-syntax",
    ],
    [
      "setAttributeNS style",
      "document.body.setAttributeNS(null, 'style', '');",
      "no-restricted-syntax",
    ],
    ["createElement style", "document.createElement('style');", "no-restricted-syntax"],
    ["createElement style template", "document.createElement(`style`);", "no-restricted-syntax"],
    ["createElementNS style", "document.createElementNS('x', 'style');", "no-restricted-syntax"],
    ["style property assignment", "document.body.style.color = 'red';", "no-restricted-syntax"],
    ["style assignment", "(document.body as any).style = 'color: red';", "no-restricted-syntax"],
    ["new Function", "new Function('return 1');", "no-restricted-syntax"],
    ["eval", "eval('1');", "no-eval"],
    ["string timer", "setTimeout('x()', 1);", "no-implied-eval"],
    ["bare import", "import { z } from 'zod';\nexport { z };", "no-restricted-imports"],
    ["bare re-export", "export { z } from 'zod';", "no-restricted-imports"],
    ["bare dynamic import", "export const z = import('zod');", "no-restricted-syntax"],
    ["bare dynamic import template", "export const z = import(`zod`);", "no-restricted-syntax"],
    [
      "computed dynamic import",
      "const m = 'zod';\nexport const z = import(m);",
      "no-restricted-syntax",
    ],
  ])("rejects %s", async (_name, code, rule) => {
    expect(await ruleIds(code)).toContain(rule);
  });

  it("allows style.setProperty and relative imports", async () => {
    const code = [
      "import './x.js';",
      "export const a = import('./a.js');",
      "export const b = import(`../b.js`);",
      "document.body.style.setProperty('--consent-text', '#000');",
      "document.body.setAttribute('class', 'consent');",
      "document.createElement('div');",
      "",
    ].join("\n");
    expect(await ruleIds(code)).toEqual([]);
  });

  it("leaves non-browser code alone", async () => {
    expect(
      await ruleIds("import { z } from 'zod';\nexport { z };\n", "src/astro/probe.ts"),
    ).toEqual([]);
  });
});

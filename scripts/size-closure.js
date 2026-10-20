// Part of check:size. size-limit with @size-limit/file measures only the files it is given, so a
// budget would silently miss a chunk that an entry imports. Fails when any JS file statically or
// dynamically imported from a budgeted file is not itself in that budget (plan: Size budget).

import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g;

function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const [, spec] of readFileSync(file, "utf8").matchAll(IMPORT)) {
    closure(normalize(join(dirname(file), spec)), seen);
  }
  return seen;
}

let failed = false;
for (const budget of JSON.parse(readFileSync(".size-limit.json", "utf8"))) {
  const paths = new Set([budget.path].flat().map((p) => normalize(p)));
  for (const entry of [...paths].filter((p) => p.endsWith(".js"))) {
    for (const file of closure(entry)) {
      if (!paths.has(file)) {
        console.error(`${budget.name}: ${entry} loads ${file}, which the budget does not count.`);
        failed = true;
      }
    }
  }
}
if (failed) process.exit(1);

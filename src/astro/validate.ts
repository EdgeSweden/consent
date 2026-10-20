// validateConfig (plan: Validation; decision #10). The schema checks shape and per-key rules; the
// checks here span several top-level keys and run once the shape is valid.

import type { z } from "zod";
import { contrastRatio, parseColor } from "./colors.js";
import { CONTRAST_PAIRS, DEFAULT_COLORS, MIN_CONTRAST } from "./defaults.js";
import { consentConfigSchema, type ConsentConfig } from "./schema.js";

export interface ValidationIssue {
  /** The offending key, e.g. `categories[1].id` or `locales.sv.categories`. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; config: ConsentConfig; errors: []; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

// Keys that a later version adds (plan: Version boundary).
const LATER_KEYS: Record<string, string> = { consentMode: "v0.2.0", gateScripts: "v0.2.0" };

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  const text = path
    .map((p) => (typeof p === "number" ? `[${p}]` : p === "" ? `[""]` : `.${String(p)}`))
    .join("")
    .replace(/^\./, "");
  return text === "" ? "(root)" : text;
}

function fromZod(issue: z.core.$ZodIssue): ValidationIssue[] {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => {
      const later = issue.path.length === 0 ? LATER_KEYS[key] : undefined;
      return {
        path: formatPath([...issue.path, key]),
        message:
          later === undefined
            ? "Unknown key."
            : `${key} is added in @edgesweden/consent ${later}; this version does not support it.`,
      };
    });
  }
  if (issue.code === "invalid_key") {
    return issue.issues.map((inner) => ({ path: formatPath(issue.path), message: inner.message }));
  }
  return [{ path: formatPath(issue.path), message: issue.message }];
}

/** Every category and service has strings in every locale, and no string key is a stray. */
function checkLocales(config: ConsentConfig, errors: ValidationIssue[]): void {
  if (!Object.hasOwn(config.locales, config.defaultLocale)) {
    errors.push({
      path: "defaultLocale",
      message: `"${config.defaultLocale}" is not a key of locales.`,
    });
  }
  const categoryIds = config.categories.map((c) => c.id);
  const serviceIds = config.categories.flatMap((c) => c.services?.map((s) => s.id) ?? []);

  for (const [locale, strings] of Object.entries(config.locales)) {
    const sections = [
      ["categories", "category", categoryIds, strings.categories],
      ["services", "service", serviceIds, strings.services ?? {}],
    ] as const;
    for (const [key, noun, ids, entries] of sections) {
      for (const id of ids) {
        if (!Object.hasOwn(entries, id)) {
          errors.push({
            path: `locales.${locale}.${key}`,
            message: `Missing strings for ${noun} "${id}".`,
          });
        }
      }
      for (const id of Object.keys(entries)) {
        if (!ids.includes(id)) {
          errors.push({
            path: `locales.${locale}.${key}.${id}`,
            message: `Matches no declared ${noun} id.`,
          });
        }
      }
    }
  }
}

/** Contrast of the checked pairs, with config colours merged over the defaults (decision #9). */
function checkContrast(
  config: ConsentConfig,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): void {
  const colors = { ...DEFAULT_COLORS, ...config.theme?.colors };
  const failures = config.validation?.strictContrast === true ? errors : warnings;

  for (const [fg, bg] of CONTRAST_PAIRS) {
    const path = `theme.colors.${fg}`;
    const fgColor = parseColor(colors[fg] ?? DEFAULT_COLORS[fg]);
    const bgColor = parseColor(colors[bg] ?? DEFAULT_COLORS[bg]);
    if (fgColor === null || bgColor === null) continue; // the schema has already reported it
    if (fgColor.a < 1 || bgColor.a < 1) {
      warnings.push({
        path,
        message: `Cannot check contrast of ${fg} on ${bg}: a colour is translucent.`,
      });
      continue;
    }
    const ratio = contrastRatio(fgColor, bgColor);
    if (ratio < MIN_CONTRAST) {
      failures.push({
        path,
        message: `Contrast of ${fg} on ${bg} is ${ratio.toFixed(2)}:1; at least ${MIN_CONTRAST}:1 is required.`,
      });
    }
  }
}

/** Validates a config object against schema version 1. Collects every error, not just the first. */
export function validateConfig(input: unknown): ValidationResult {
  const parsed = consentConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.flatMap(fromZod), warnings: [] };
  }
  const config = parsed.data;
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  checkLocales(config, errors);
  checkContrast(config, errors, warnings);
  return errors.length === 0
    ? { ok: true, config, errors: [], warnings }
    : { ok: false, errors, warnings };
}

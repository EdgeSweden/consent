// validateConfig (plan: Validation; decision #10). The schema checks shape and per-key rules; the
// checks here span several top-level keys and run on every part of the input that is valid.

import type { z } from "zod";
import { contrastRatio, parseColor } from "./colors.js";
import { CONTRAST_PAIRS, DEFAULT_COLORS, MIN_CONTRAST, THEME_COLORS } from "./defaults.js";
import { consentConfigSchema, type ConsentConfig, type ThemeColor } from "./schema.js";

export interface ValidationIssue {
  /** The offending key, e.g. `categories[1].id` or `locales.sv.categories`. */
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; config: ConsentConfig; errors: []; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

// Keys that a later version adds (plan: Version boundary).
const LATER_KEYS: Record<string, string> = { consentMode: "v0.2.0" };

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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The parts of the input the cross-key checks need, each kept only when it is valid on its own, so
 * those checks still run next to unrelated schema errors (decision #10).
 */
interface Parts {
  defaultLocale: string | undefined;
  localeKeys: string[] | undefined;
  /** Declared category and service ids, or undefined when `categories` is not an array. */
  ids: { categories: string[]; services: string[] } | undefined;
  /** Per locale, the string keys of `categories` and `services`, or undefined when not an object. */
  locales: Array<{ locale: string; categories?: string[]; services?: string[] }>;
  /** The valid config colours; an invalid one is left at its default and reported by the schema. */
  colors: Partial<Record<ThemeColor, string>>;
  strictContrast: boolean;
}

function parts(input: unknown): Parts {
  const raw = isObject(input) ? input : {};
  const theme = isObject(raw["theme"]) ? raw["theme"] : {};
  const validation = isObject(raw["validation"]) ? raw["validation"] : {};
  const locales = isObject(raw["locales"]) ? raw["locales"] : undefined;
  const colors = isObject(theme["colors"]) ? theme["colors"] : {};
  const categories = Array.isArray(raw["categories"])
    ? raw["categories"].filter(isObject)
    : undefined;
  const idOf = (v: unknown) => (isObject(v) && typeof v["id"] === "string" ? [v["id"]] : []);
  return {
    defaultLocale: typeof raw["defaultLocale"] === "string" ? raw["defaultLocale"] : undefined,
    localeKeys: locales && Object.keys(locales),
    // Ids only, so unrelated errors in a category do not hide the locale checks.
    ids: categories && {
      categories: categories.flatMap(idOf),
      services: categories.flatMap((c) =>
        Array.isArray(c["services"]) ? c["services"].flatMap(idOf) : [],
      ),
    },
    // Only the keys matter here, so unrelated errors elsewhere in a locale do not hide these checks.
    locales: Object.entries(locales ?? {}).map(([locale, value]) => {
      const strings = isObject(value) ? value : {};
      const services = strings["services"] ?? {};
      return {
        locale,
        ...(isObject(strings["categories"]) && { categories: Object.keys(strings["categories"]) }),
        ...(isObject(services) && { services: Object.keys(services) }),
      };
    }),
    colors: Object.fromEntries(
      THEME_COLORS.flatMap((token) => {
        const value = colors[token];
        return typeof value === "string" && parseColor(value) !== null ? [[token, value]] : [];
      }),
    ),
    strictContrast: validation["strictContrast"] === true,
  };
}

/** Every category and service has strings in every locale, and no string key is a stray. */
function checkLocales(p: Parts, errors: ValidationIssue[]): void {
  if (p.defaultLocale !== undefined && p.localeKeys !== undefined) {
    if (!p.localeKeys.includes(p.defaultLocale)) {
      errors.push({
        path: "defaultLocale",
        message: `"${p.defaultLocale}" is not a key of locales.`,
      });
    }
  }
  if (p.ids === undefined) return;
  const { categories: categoryIds, services: serviceIds } = p.ids;

  for (const { locale, ...keys } of p.locales) {
    const sections = [
      ["categories", "category", categoryIds, keys.categories],
      ["services", "service", serviceIds, keys.services],
    ] as const;
    for (const [key, noun, ids, present] of sections) {
      if (present === undefined) continue; // not an object; the schema reports it
      for (const id of ids) {
        if (!present.includes(id)) {
          errors.push({
            path: `locales.${locale}.${key}`,
            message: `Missing strings for ${noun} "${id}".`,
          });
        }
      }
      for (const id of present) {
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
function checkContrast(p: Parts, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  const colors = { ...DEFAULT_COLORS, ...p.colors };
  const failures = p.strictContrast ? errors : warnings;

  for (const [fg, bg] of CONTRAST_PAIRS) {
    const path = `theme.colors.${fg}`;
    const fgColor = parseColor(colors[fg] ?? DEFAULT_COLORS[fg]);
    const bgColor = parseColor(colors[bg] ?? DEFAULT_COLORS[bg]);
    if (fgColor === null || bgColor === null) continue; // unreachable: only valid colours remain
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
  const errors = parsed.success ? [] : parsed.error.issues.flatMap(fromZod);
  const warnings: ValidationIssue[] = [];
  const p = parts(input);
  checkLocales(p, errors);
  checkContrast(p, errors, warnings);
  return parsed.success && errors.length === 0
    ? { ok: true, config: parsed.data, errors: [], warnings }
    : { ok: false, errors, warnings };
}

// Config schema version 1 (plan: Config). The TypeScript types are derived from this schema so the
// two cannot drift. Rules that span several top-level keys live in validate.ts.

import { z } from "zod";
import type { ConsentRecorder } from "../core/types.js";
import { LINK_TOKEN } from "../core/text.js";
import { isLinkHref, isRecordUrl } from "../core/urls.js";
import { parseColor } from "./colors.js";
import { THEME_COLORS, colorProperty, type ThemeColor } from "./defaults.js";

const nonEmpty = z.string().min(1);

const COOKIE_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const HOSTNAME =
  /^\.?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const CATEGORY_ID = /^[a-z][a-z0-9_-]{0,31}$/;
const VAR_NAME = /^--consent-[A-Za-z0-9_-]+$/;

const BUTTONS = ["acceptAll", "rejectAll", "settings"] as const;

/** The Google Consent Mode v2 keys (decision #48). */
export const GTAG_CONSENT_KEYS = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
  "analytics_storage",
  "functionality_storage",
  "personalization_storage",
  "security_storage",
] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Group rules run even when a sibling field has an error, so every error is collected
// (decision #10). They therefore read their input as unknown and check each field they use.
const always = { when: (payload: { value: unknown }) => isObject(payload.value) };
const alwaysArray = { when: (payload: { value: unknown }) => Array.isArray(payload.value) };
const COLOR_PROPERTIES = new Set(THEME_COLORS.map(colorProperty));

const cookie = z.strictObject({
  name: z.string().regex(COOKIE_TOKEN, "Must be a valid cookie name (RFC 6265 token).").optional(),
  maxAgeDays: z.int().min(1).max(400).optional(),
  domain: z.string().regex(HOSTNAME, "Must be a hostname.").optional(),
  path: z.string().startsWith("/", "Must start with /.").optional(),
});

const service = z.strictObject({
  id: nonEmpty,
  cookies: z.array(nonEmpty).optional(),
});

const category = z.strictObject({
  id: z.string().regex(CATEGORY_ID, `Must match ${CATEGORY_ID.source}.`),
  required: z.boolean().optional(),
  services: z.array(service).optional(),
});

const categories = z.array(category).superRefine((input: unknown[], ctx) => {
  const list = input.filter(isObject);
  const categoryIds = new Set<unknown>();
  const serviceIds = new Set<unknown>();
  input.forEach((c, i) => {
    if (!isObject(c)) return;
    if (typeof c["id"] === "string" && categoryIds.has(c["id"])) {
      ctx.addIssue({
        code: "custom",
        path: [i, "id"],
        message: `Duplicate category id "${String(c["id"])}".`,
      });
    }
    categoryIds.add(c["id"]);
    asArray(c["services"]).forEach((s, j) => {
      if (!isObject(s) || typeof s["id"] !== "string") return;
      if (serviceIds.has(s["id"])) {
        ctx.addIssue({
          code: "custom",
          path: [i, "services", j, "id"],
          message: `Duplicate service id "${s["id"]}"; service ids are unique across all categories.`,
        });
      }
      serviceIds.add(s["id"]);
    });
  });
  if (!list.some((c) => c["required"] !== true)) {
    ctx.addIssue({
      code: "custom",
      message:
        "At least one optional (non-required) category is needed; otherwise there is nothing to consent to.",
    });
  }
}, alwaysArray);

const link = z.strictObject({
  id: nonEmpty,
  label: nonEmpty,
  href: z
    .string()
    .refine(isLinkHref, "Must be a root-relative path, an absolute http(s) URL or a #fragment."),
});

const localeStrings = z
  .strictObject({
    title: z.string(),
    description: z.string(),
    acceptAll: z.string(),
    rejectAll: z.string(),
    settings: z.string(),
    save: z.string(),
    close: z.string(),
    alwaysActive: z.string(),
    settingsTitle: z.string(),
    settingsDescription: z.string().optional(),
    dialogLabel: z.string().optional(),
    links: z.array(link).optional(),
    categories: z.record(z.string(), z.strictObject({ name: z.string(), description: z.string() })),
    services: z
      .record(z.string(), z.strictObject({ name: z.string(), description: z.string().optional() }))
      .optional(),
  })
  .superRefine((strings: Record<string, unknown>, ctx) => {
    const linkIds = new Set(asArray(strings["links"]).map((l) => (isObject(l) ? l["id"] : l)));
    for (const key of ["description", "settingsDescription"] as const) {
      const text = strings[key];
      if (typeof text !== "string") continue;
      for (const [, id = ""] of text.matchAll(LINK_TOKEN)) {
        if (!linkIds.has(id)) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `{link:${id}} matches no entry in links.`,
          });
        }
      }
    }
  }, always);

const layout = z
  .strictObject({
    position: z
      .enum([
        "bottom-left",
        "bottom-right",
        "bottom-center",
        "top-left",
        "top-right",
        "top-center",
        "center",
      ])
      .optional(),
    backdrop: z.enum(["dim", "none"]).optional(),
    blocking: z.boolean().optional(),
    width: nonEmpty.optional(),
    settingsPosition: z.literal("center").optional(),
  })
  .superRefine((l: Record<string, unknown>, ctx) => {
    if ((l["blocking"] ?? true) === true && l["backdrop"] === "none") {
      ctx.addIssue({
        code: "custom",
        path: ["blocking"],
        message:
          'Blocking mode (the default) requires backdrop "dim"; set blocking to false or backdrop to "dim".',
      });
    }
  }, always);

const color = z.string().refine((v) => parseColor(v) !== null, {
  message:
    "Must be a CSS colour: hex, rgb(), rgba(), hsl(), hsla(), a named colour or transparent.",
});

const colors = z.strictObject(
  Object.fromEntries(THEME_COLORS.map((t) => [t, color.optional()])) as Record<
    ThemeColor,
    z.ZodOptional<typeof color>
  >,
);

const theme = z.strictObject({
  colors: colors.optional(),
  radius: z
    .strictObject({
      box: nonEmpty.optional(),
      button: nonEmpty.optional(),
      control: nonEmpty.optional(),
    })
    .optional(),
  font: nonEmpty.optional(),
  zIndex: z.int().optional(),
  vars: z
    .record(z.string().regex(VAR_NAME, `Must match ${VAR_NAME.source}.`), nonEmpty)
    .superRefine((vars: Record<string, unknown>, ctx) => {
      for (const name of Object.keys(vars)) {
        if (COLOR_PROPERTIES.has(name)) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `${name} is a colour token; set it through theme.colors so contrast is checked.`,
          });
        }
      }
    }, always)
    .optional(),
});

const buttons = z
  .strictObject({
    settings: z.boolean().optional(),
    order: z.array(z.enum(BUTTONS)).optional(),
  })
  .superRefine((b: Record<string, unknown>, ctx) => {
    const order = b["order"];
    if (!Array.isArray(order)) return;
    const expected = BUTTONS.filter((name) => name !== "settings" || b["settings"] !== false);
    const isPermutation =
      order.length === expected.length && expected.every((name) => order.includes(name));
    if (!isPermutation) {
      ctx.addIssue({
        code: "custom",
        path: ["order"],
        message: `Must list ${expected.join(", ")} exactly once each, in any order.`,
      });
    }
  }, always);

const record = z.custom<ConsentRecorder | string>(
  (v) => typeof v === "function" || (typeof v === "string" && isRecordUrl(v)),
  "Must be a function, a root-relative path (/…) or an absolute http(s) URL.",
);

const gtagKey = z.enum(GTAG_CONSENT_KEYS);

// Each key is owned by one category or set in `extra`, never both (plan: Validation). Whether a
// mapping key names a declared category is checked in validate.ts.
const consentMode = z
  .strictObject({
    mapping: z.record(z.string(), z.array(gtagKey).min(1)),
    extra: z.partialRecord(gtagKey, z.enum(["granted", "denied"])).optional(),
  })
  .superRefine((mode: Record<string, unknown>, ctx) => {
    const owned = new Set<unknown>();
    const mapping = isObject(mode["mapping"]) ? mode["mapping"] : {};
    for (const [id, keys] of Object.entries(mapping)) {
      asArray(keys).forEach((key, i) => {
        if (owned.has(key)) {
          ctx.addIssue({
            code: "custom",
            path: ["mapping", id, i],
            message: `${String(key)} is mapped more than once; each key belongs to one category.`,
          });
        }
        owned.add(key);
      });
    }
    const extra = isObject(mode["extra"]) ? mode["extra"] : {};
    for (const key of Object.keys(extra)) {
      if (owned.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["extra", key],
          message: `${key} is in mapping; a key is either mapped or in extra, not both.`,
        });
      }
    }
  }, always);

export const consentConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  policyVersion: z.string().min(1).max(32),
  cookie: cookie.optional(),
  defaultLocale: nonEmpty,
  locale: nonEmpty.optional(),
  categories,
  locales: z.record(nonEmpty, localeStrings),
  layout: layout.optional(),
  theme: theme.optional(),
  validation: z.strictObject({ strictContrast: z.boolean().optional() }).optional(),
  buttons: buttons.optional(),
  record: record.optional(),
  /** Google Consent Mode v2 adapter (`./gtag`). */
  consentMode: consentMode.optional(),
  /** Script-gating adapter (`./gate`); default false (plan: Version boundary). */
  gateScripts: z.boolean().optional(),
});

export type ConsentConfig = z.output<typeof consentConfigSchema>;
export type GtagConsentKey = (typeof GTAG_CONSENT_KEYS)[number];
export type LocaleStrings = z.output<typeof localeStrings>;
export type { ThemeColor };

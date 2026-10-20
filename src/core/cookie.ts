// Consent cookie codec (plan: Cookie). Reading the cookie is the only I/O allowed before a choice.

import type { ConsentConfig } from "../astro/schema.js";

export interface StoredChoice {
  /** Policy version the choice was made under. */
  p: string;
  /** Unix seconds. */
  t: number;
  /** Category id → granted. */
  c: Record<string, boolean>;
}

const DEFAULT_NAME = "consent";
const DEFAULT_MAX_AGE_DAYS = 365;

export const cookieName = (config: ConsentConfig): string => config.cookie?.name ?? DEFAULT_NAME;

export function encodeChoice(choice: StoredChoice): string {
  return encodeURIComponent(JSON.stringify({ v: 1, p: choice.p, t: choice.t, c: choice.c }));
}

/** Decodes a cookie value; anything malformed is treated as absent (decision #15). */
export function decodeChoice(value: string): StoredChoice | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, p, t, c } = parsed as Record<string, unknown>;
  if (v !== 1 || typeof p !== "string" || typeof t !== "number" || !Number.isFinite(t)) return null;
  if (typeof c !== "object" || c === null || Array.isArray(c)) return null;
  const categories: Record<string, boolean> = {};
  for (const [id, granted] of Object.entries(c)) {
    if (typeof granted !== "boolean") return null;
    categories[id] = granted;
  }
  return { p, t, c: categories };
}

/** The first cookie named `name` in `document.cookie` (decision #15), decoded. */
export function readChoice(doc: Document, name: string): StoredChoice | null {
  for (const pair of doc.cookie.split(";")) {
    const index = pair.indexOf("=");
    if (index !== -1 && pair.slice(0, index).trim() === name) {
      return decodeChoice(pair.slice(index + 1).trim());
    }
  }
  return null;
}

export function serializeCookie(
  config: ConsentConfig,
  choice: StoredChoice,
  secure: boolean,
): string {
  const { maxAgeDays = DEFAULT_MAX_AGE_DAYS, path = "/", domain } = config.cookie ?? {};
  const parts = [
    `${cookieName(config)}=${encodeChoice(choice)}`,
    `Max-Age=${maxAgeDays * 86400}`,
    `Path=${path}`,
  ];
  if (domain !== undefined) parts.push(`Domain=${domain}`);
  parts.push("SameSite=Lax");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function writeChoice(doc: Document, config: ConsentConfig, choice: StoredChoice): void {
  doc.cookie = serializeCookie(config, choice, doc.location?.protocol === "https:");
}

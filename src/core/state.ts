// Consent state machine, state API and DOM mirror (plan: Mount, Required categories, Action
// semantics, State API). One state per page: a module singleton (decision #18).

import type { ConsentConfig } from "../astro/schema.js";
import { cookieName, readChoice, writeChoice } from "./cookie.js";
import { resolveLocale } from "./locale.js";
import type { ConsentAction, ConsentState } from "./types.js";

type Subscriber = (state: ConsentState) => void;

interface Mounted {
  config: ConsentConfig;
  doc: Document;
  required: string[];
  optional: string[];
  /** Optional category states of the valid stored choice, or null when there is none. */
  stored: Record<string, boolean> | null;
  state: ConsentState;
}

let mounted: Mounted | null = null;
const subscribers = new Set<Subscriber>();

const copy = (state: ConsentState): ConsentState => ({
  ...state,
  categories: { ...state.categories },
});

/** A throwing subscriber must not stop the others or undo a stored choice. */
function notify(subscriber: Subscriber, state: ConsentState): void {
  try {
    subscriber(copy(state));
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

function mirror(doc: Document, state: ConsentState): void {
  for (const [id, granted] of Object.entries(state.categories)) {
    doc.documentElement.setAttribute(`data-consent-${id}`, granted ? "granted" : "denied");
  }
}

interface Delivery {
  doc: Document;
  /** Snapshot taken when the state was established, before any consumer code runs. */
  state: ConsentState;
  /** Dispatch `consent:change`; false for mount and a new subscriber's initial call. */
  event: boolean;
  /** The subscribers at the time the state was established. */
  to: Subscriber[];
}

const queue: Delivery[] = [];
let delivering = false;

/**
 * Delivers states in the order they were established. A consumer that changes consent while
 * being notified queues its change behind the current delivery, so every consumer sees the
 * initial state and then each change in order.
 */
function deliver(delivery: Delivery): void {
  queue.push(delivery);
  if (delivering) return;
  delivering = true;
  try {
    let next: Delivery | undefined;
    while ((next = queue.shift()) !== undefined) {
      const { doc, state, event, to } = next;
      mirror(doc, state);
      if (event) doc.dispatchEvent(new CustomEvent("consent:change", { detail: copy(state) }));
      for (const subscriber of to) {
        if (subscribers.has(subscriber)) notify(subscriber, state);
      }
    }
  } finally {
    delivering = false;
  }
}

function categoriesOf(
  m: Pick<Mounted, "required" | "optional">,
  optional: Record<string, boolean>,
) {
  const categories: Record<string, boolean> = {};
  for (const id of m.required) categories[id] = true;
  for (const id of m.optional) categories[id] = optional[id] === true;
  return categories;
}

/** Reads the cookie, establishes the initial state and calls every existing subscriber once. */
export function mount(config: ConsentConfig, doc: Document = document): void {
  if (mounted !== null) return;
  const required = config.categories.filter((c) => c.required === true).map((c) => c.id);
  const optional = config.categories.filter((c) => c.required !== true).map((c) => c.id);
  const ids = config.categories.map((c) => c.id);

  const choice = readChoice(doc, cookieName(config));
  const storedIds = choice === null ? [] : Object.keys(choice.c);
  const valid =
    choice !== null &&
    choice.p === config.policyVersion &&
    storedIds.length === ids.length &&
    ids.every((id) => Object.hasOwn(choice.c, id));

  const stored = valid
    ? Object.fromEntries(optional.map((id) => [id, choice.c[id] === true]))
    : null;
  const state: ConsentState = {
    categories: categoriesOf({ required, optional }, stored ?? {}),
    policyVersion: config.policyVersion,
    locale: resolveLocale(config, doc),
    at: valid ? choice.t : null,
  };
  mounted = { config, doc, required, optional, stored, state };
  deliver({ doc, state: copy(state), event: false, to: [...subscribers] });
}

/** True when there is no valid stored choice and the banner must be shown. */
export function needsChoice(): boolean {
  return mounted !== null && mounted.stored === null;
}

export interface Transition {
  action: ConsentAction;
  state: ConsentState;
}

function actionFor(
  optional: string[],
  next: Record<string, boolean>,
  before: Record<string, boolean> | null,
): ConsentAction {
  if (optional.every((id) => next[id] === true)) return "accept_all";
  if (optional.every((id) => next[id] !== true)) {
    return before !== null && optional.some((id) => before[id] === true)
      ? "withdraw"
      : "reject_all";
  }
  return "custom";
}

/**
 * Applies a choice of optional categories (missing ids are denied). Returns the transition, or
 * null when nothing was written: before mount, or a no-op against a valid stored choice.
 */
export function choose(granted: Record<string, boolean>): Transition | null {
  if (mounted === null) return null;
  const m = mounted;
  const next = Object.fromEntries(m.optional.map((id) => [id, granted[id] === true]));
  const before = m.stored;
  if (before !== null && m.optional.every((id) => before[id] === next[id])) return null;

  const action = actionFor(m.optional, next, before);
  const at = Math.floor(Date.now() / 1000);
  const categories = categoriesOf(m, next);
  writeChoice(m.doc, m.config, { p: m.config.policyVersion, t: at, c: categories });

  m.stored = next;
  m.state = { ...m.state, categories, at };
  const state = copy(m.state);
  deliver({ doc: m.doc, state, event: true, to: [...subscribers] });
  return { action, state: copy(state) };
}

const every = (granted: boolean): Record<string, boolean> =>
  Object.fromEntries((mounted?.optional ?? []).map((id) => [id, granted]));

export const acceptAll = (): Transition | null => choose(every(true));
export const rejectAll = (): Transition | null => choose(every(false));

/** The current state, or null before mount. */
export function getConsent(): ConsentState | null {
  return mounted === null ? null : copy(mounted.state);
}

/**
 * Subscribes to consent state: called once during mount (or immediately when already mounted),
 * then on every change. Returns an unsubscribe function.
 */
export function onConsent(subscriber: Subscriber): () => void {
  const entry: Subscriber = (state) => subscriber(state);
  subscribers.add(entry);
  // Called before returning, even during a delivery. Queued deliveries only reach the subscribers
  // of their time, so this subscriber never sees a state older than this one.
  if (mounted !== null) notify(entry, mounted.state);
  return () => {
    subscribers.delete(entry);
  };
}

/** Denies every optional category; a no-op before mount (decision #17). */
export function withdraw(): void {
  rejectAll();
}

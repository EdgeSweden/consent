// Banner and settings dialog (plan: Choice, Accessibility; decisions #19–#25). The DOM is built
// with createElement and text nodes only (plan: CSP).

import type { ConsentConfig, LocaleStrings } from "../astro/schema.js";
import { acceptAll, choose, getConsent, needsChoice, rejectAll } from "./state.js";
import { appendText } from "./text.js";
import { applyTheme } from "./theme.js";

type FirstLayerButton = "acceptAll" | "rejectAll" | "settings";

interface Ui {
  doc: Document;
  root: HTMLElement;
  backdrop: HTMLElement;
  banner: HTMLElement;
  settings: HTMLElement;
  /** Optional category id → its switch. */
  toggles: Map<string, HTMLInputElement>;
  blocking: boolean;
  dim: boolean;
  /** Elements made inert while a modal dialog is open; null when none is. */
  inerted: Element[] | null;
  /** Watches body while modal, so later content is made inert too. */
  observer: MutationObserver | null;
  /** Focus targets on close (decision #20). */
  bannerOpener: Element | null;
  settingsOpener: Element | null;
  /** The settings dialog replaced the visible banner and returns to it on close. */
  fromBanner: boolean;
}

let ui: Ui | null = null;
let started = false;
/** openSettings() called after mount but before the dialogs exist (decision #24). */
let pendingOpen = false;

const CLASS: Record<FirstLayerButton | "save" | "close", string> = {
  acceptAll: "consent-accept",
  rejectAll: "consent-reject",
  settings: "consent-preferences",
  save: "consent-save",
  close: "consent-close",
};

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(doc: Document, kind: keyof typeof CLASS, text: string, onClick: () => void) {
  const node = el(doc, "button", `consent-button ${CLASS[kind]}`, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function dialog(doc: Document, className: string): HTMLElement {
  const node = el(doc, "div", className);
  node.setAttribute("role", "dialog");
  node.tabIndex = -1;
  node.hidden = true;
  return node;
}

/** `buttons.order`, or the default order without `settings` when it is disabled. */
function firstLayer(config: ConsentConfig): FirstLayerButton[] {
  const order = config.buttons?.order ?? ["acceptAll", "rejectAll", "settings"];
  return config.buttons?.settings === false ? order.filter((b) => b !== "settings") : order;
}

/** An id prefix no element uses yet, so ARIA and label references resolve inside the root. */
function idPrefix(doc: Document): string {
  let n = 0;
  while (doc.querySelector(`[id^="consent${n}-"]`) !== null) n++;
  return `consent${n}-`;
}

function build(config: ConsentConfig, doc: Document, locale: string, s: LocaleStrings): Ui {
  const layout = config.layout ?? {};
  const prefix = idPrefix(doc);
  const root = el(doc, "div", "consent-root");
  root.lang = locale;
  root.dataset["position"] = layout.position ?? "center";
  applyTheme(config, root);
  const backdrop = el(doc, "div", "consent-backdrop");
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;

  const actions = {
    acceptAll: () => decide(acceptAll),
    rejectAll: () => decide(rejectAll),
    settings: () => showSettings(doc.activeElement),
  };

  const banner = dialog(doc, "consent-banner");
  const blocking = layout.blocking ?? true;
  if (blocking) banner.setAttribute("aria-modal", "true");
  const title = el(doc, "h2", "consent-title", s.title);
  title.id = `${prefix}title`;
  if (s.dialogLabel !== undefined) banner.setAttribute("aria-label", s.dialogLabel);
  else banner.setAttribute("aria-labelledby", title.id);
  const description = el(doc, "p", "consent-description");
  appendText(doc, description, s.description, s.links);
  description.id = `${prefix}description`;
  banner.setAttribute("aria-describedby", description.id);
  const bannerActions = el(doc, "div", "consent-actions");
  for (const name of firstLayer(config)) {
    bannerActions.append(button(doc, name, s[name], actions[name]));
  }
  banner.append(title, description, bannerActions);
  if (!blocking) banner.append(button(doc, "close", s.close, closeBanner));

  const settings = dialog(doc, "consent-settings");
  settings.setAttribute("aria-modal", "true");
  const header = el(doc, "div", "consent-header");
  const settingsTitle = el(doc, "h2", "consent-title", s.settingsTitle);
  settingsTitle.id = `${prefix}settings-title`;
  settings.setAttribute("aria-labelledby", settingsTitle.id);
  header.append(settingsTitle, button(doc, "close", s.close, closeSettings));
  settings.append(header);
  if (s.settingsDescription !== undefined) {
    const p = el(doc, "p", "consent-description");
    appendText(doc, p, s.settingsDescription, s.links);
    p.id = `${prefix}settings-description`;
    settings.setAttribute("aria-describedby", p.id);
    settings.append(p);
  }

  const toggles = new Map<string, HTMLInputElement>();
  const list = el(doc, "ul", "consent-categories");
  for (const category of config.categories) {
    const text = s.categories[category.id];
    const id = `${prefix}category-${category.id}`;
    const item = el(doc, "li", "consent-category");
    const row = el(doc, "div", "consent-category-header");
    const label = el(doc, "label", "consent-category-name", text?.name ?? category.id);
    label.htmlFor = id;
    const input = el(doc, "input", "consent-toggle");
    input.type = "checkbox";
    input.id = id;
    const described: string[] = [];
    row.append(label);
    if (category.required === true) {
      input.checked = true;
      input.disabled = true;
      const always = el(doc, "span", "consent-always", s.alwaysActive);
      always.id = `${id}-always`;
      described.push(always.id);
      row.append(always);
    } else {
      toggles.set(category.id, input);
    }
    row.append(input);
    item.append(row);
    if (text !== undefined) {
      const p = el(doc, "p", "consent-category-description", text.description);
      p.id = `${id}-description`;
      described.push(p.id);
      item.append(p);
    }
    if (described.length > 0) input.setAttribute("aria-describedby", described.join(" "));
    if (category.services !== undefined && category.services.length > 0) {
      const services = el(doc, "ul", "consent-services");
      for (const service of category.services) {
        const strings = s.services?.[service.id];
        const entry = el(doc, "li", "consent-service");
        entry.append(el(doc, "span", "consent-service-name", strings?.name ?? service.id));
        if (strings?.description !== undefined) {
          entry.append(el(doc, "span", "consent-service-description", strings.description));
        }
        services.append(entry);
      }
      item.append(services);
    }
    list.append(item);
  }
  const save = () => {
    const granted: Record<string, boolean> = {};
    for (const [id, input] of toggles) granted[id] = input.checked;
    decide(() => choose(granted));
  };
  const settingsActions = el(doc, "div", "consent-actions");
  settingsActions.append(
    button(doc, "acceptAll", s.acceptAll, actions.acceptAll),
    button(doc, "rejectAll", s.rejectAll, actions.rejectAll),
    button(doc, "save", s.save, save),
  );
  settings.append(list, settingsActions);

  root.append(backdrop, banner, settings);
  return {
    doc,
    root,
    backdrop,
    banner,
    settings,
    toggles,
    blocking,
    dim: (layout.backdrop ?? "dim") === "dim",
    inerted: null,
    observer: null,
    bannerOpener: null,
    settingsOpener: null,
    fromBanner: false,
  };
}

/** Applies backdrop, modality and `inert` for the dialogs currently shown. */
function sync(u: Ui): void {
  const open = !u.banner.hidden || !u.settings.hidden;
  const modal = !u.settings.hidden || (!u.banner.hidden && u.blocking);
  u.backdrop.hidden = !open || !u.dim;
  u.root.toggleAttribute("data-modal", modal);
  if (modal && u.inerted === null) {
    const inerted: Element[] = [];
    u.inerted = inerted;
    inertSiblings(u, inerted);
    // Content added or re-enabled while modal is made inert too; a removed root frees the page.
    u.observer = new MutationObserver(() => {
      if (u.root.isConnected) inertSiblings(u, inerted);
      else release(u);
    });
    u.observer.observe(u.doc.body, { childList: true, subtree: true, attributeFilter: ["inert"] });
  } else if (!modal) {
    release(u);
  }
}

/** Makes every other child of body inert; one that already was stays host-owned (decision #21). */
function inertSiblings(u: Ui, inerted: Element[]): void {
  for (const child of Array.from(u.doc.body.children)) {
    if (child === u.root || child.hasAttribute("inert")) continue;
    child.setAttribute("inert", "");
    if (!inerted.includes(child)) inerted.push(child);
  }
}

function release(u: Ui): void {
  u.observer?.disconnect();
  u.observer = null;
  for (const child of u.inerted ?? []) child.removeAttribute("inert");
  u.inerted = null;
}

/** Returns focus to `target`, or lets it fall back to the body (decision #20). */
function restore(u: Ui, target: Element | null): void {
  if (target !== null && target.isConnected && "focus" in target) {
    (target as HTMLElement).focus();
  }
  const active = u.doc.activeElement as HTMLElement | null;
  if (active !== null && u.root.contains(active) && active.closest("[hidden]") !== null) {
    active.blur();
  }
}

function showBanner(u: Ui): void {
  u.bannerOpener = u.doc.activeElement;
  u.banner.hidden = false;
  sync(u);
  u.banner.focus();
}

/** Non-blocking close: "decide later", nothing is stored (plan: Principles, 2). */
function closeBanner(): void {
  const u = ui;
  if (u === null || u.banner.hidden) return;
  u.banner.hidden = true;
  sync(u);
  restore(u, u.bannerOpener);
}

function showSettings(opener: Element | null): void {
  const u = ui;
  // A root the host removed is never reopened: it would make the page inert with no dialog.
  if (u === null || !u.root.isConnected || !u.settings.hidden) return;
  const categories = getConsent()?.categories ?? {};
  for (const [id, input] of u.toggles) input.checked = categories[id] === true;
  u.fromBanner = !u.banner.hidden;
  u.settingsOpener = opener;
  u.banner.hidden = true;
  u.settings.hidden = false;
  sync(u);
  u.settings.focus();
}

function closeSettings(): void {
  const u = ui;
  if (u === null || u.settings.hidden) return;
  u.settings.hidden = true;
  if (u.fromBanner) {
    u.banner.hidden = false;
    sync(u);
    u.banner.focus();
    restore(u, u.settingsOpener);
  } else {
    sync(u);
    restore(u, u.settingsOpener);
  }
}

/** Closes every dialog, then applies the choice; a no-op choice only closes (plan: Choice). */
function decide(apply: () => unknown): void {
  const u = ui;
  if (u === null) return;
  const target = !u.settings.hidden && !u.fromBanner ? u.settingsOpener : u.bannerOpener;
  u.banner.hidden = true;
  u.settings.hidden = true;
  sync(u);
  restore(u, target);
  apply();
}

const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled])";

/** Keeps Tab inside a modal dialog (plan: Accessibility). */
function trap(event: KeyboardEvent, u: Ui, active: HTMLElement): void {
  const focusable = Array.from(active.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = u.doc.activeElement;
  if (first === undefined || last === undefined) {
    event.preventDefault();
    active.focus();
    return;
  }
  const outside = current === null || current === active || !active.contains(current);
  if (event.shiftKey ? outside || current === first : current === last || outside) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

function onKeydown(event: KeyboardEvent): void {
  const u = ui;
  // A host that replaced the body (a client-side navigation) keeps its own keyboard.
  if (u === null || !u.root.isConnected) return;
  const active = !u.settings.hidden ? u.settings : !u.banner.hidden ? u.banner : null;
  if (active === null) return;
  if (event.key === "Escape") {
    // A blocking banner ignores Escape; a non-blocking one treats it as its close control.
    if (active === u.settings) closeSettings();
    else if (!u.blocking && active.contains(u.doc.activeElement)) closeBanner();
    return;
  }
  if (event.key === "Tab" && u.root.hasAttribute("data-modal")) trap(event, u, active);
}

/** Reopen control: any `[data-consent="open"]` (plan: State API; decision #23). */
function onClick(event: Event): void {
  const target = event.target as Element | null;
  const opener =
    typeof target?.closest === "function" ? target.closest('[data-consent="open"]') : null;
  if (opener === null || ui === null || !ui.root.isConnected) return;
  event.preventDefault();
  showSettings(opener);
}

/** Builds the dialogs for a mounted state and shows the banner when a choice is needed. */
export function mountUi(config: ConsentConfig, doc: Document): void {
  if (started) return;
  const locale = getConsent()?.locale;
  const strings = locale === undefined ? undefined : config.locales[locale];
  if (locale === undefined || strings === undefined) return;
  started = true;
  doc.addEventListener("click", onClick);
  doc.addEventListener("keydown", onKeydown);
  const start = () => {
    const u = build(config, doc, locale, strings);
    ui = u;
    doc.body.append(u.root);
    if (needsChoice()) showBanner(u);
    if (pendingOpen) showSettings(doc.activeElement);
  };
  if (doc.body === null) doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}

/** Opens the settings dialog; a no-op before mount (decision #23). */
export function openSettings(): void {
  if (ui === null) pendingOpen = started;
  else showSettings(ui.doc.activeElement);
}

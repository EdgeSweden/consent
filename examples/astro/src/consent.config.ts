// The demo's consent config: blocking with a dimmed backdrop, the defaults, and both adapters
// (plan: Demo).
import type { ConsentConfig, ConsentRecord } from "@edgesweden/consent/astro";
import { consentStrings } from "./strings.js";

// Appends each record to the page's list so the recorded `action` is visible (plan: Demo).
function showRecord(record: ConsentRecord): void {
  const list = document.getElementById("consent-records");
  if (!list) return;
  const item = document.createElement("li");
  item.dataset["action"] = record.action;
  item.textContent = JSON.stringify(record);
  list.append(item);
}

const config: ConsentConfig = {
  schemaVersion: 1,
  policyVersion: "2026-10",
  defaultLocale: "en",
  categories: [
    { id: "necessary", required: true, services: [{ id: "session" }] },
    { id: "analytics", services: [{ id: "stats" }] },
    { id: "marketing", services: [{ id: "ads" }] },
  ],
  locales: consentStrings,
  record: showRecord,
  gateScripts: true,
  consentMode: {
    mapping: {
      necessary: ["security_storage"],
      analytics: ["analytics_storage"],
      marketing: ["ad_storage", "ad_user_data", "ad_personalization"],
    },
    extra: { personalization_storage: "denied" },
  },
};

export default config;

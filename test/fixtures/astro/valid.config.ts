import type { ConsentConfig } from "../../../src/astro/index.js";
import { strings } from "./strings.js";

const config: ConsentConfig = {
  schemaVersion: 1,
  policyVersion: "2026-10",
  defaultLocale: "en",
  categories: [{ id: "necessary", required: true }, { id: "analytics" }],
  locales: { en: strings },
  record: (record) => void record,
};

export default config;

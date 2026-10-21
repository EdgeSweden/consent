import type { ConsentConfig } from "../../../src/astro/index.js";
import base from "./valid.config.js";

const config: ConsentConfig = {
  ...base,
  gateScripts: true,
  consentMode: { mapping: { necessary: ["security_storage"], analytics: ["analytics_storage"] } },
};

export default config;

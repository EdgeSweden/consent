// The same config with a non-blocking banner that has a close control (plan: Principles, 2).
import type { ConsentConfig } from "@edgesweden/consent/astro";
import base from "./consent.config.js";

const config: ConsentConfig = {
  ...base,
  layout: { position: "bottom-right", backdrop: "none", blocking: false },
};

export default config;

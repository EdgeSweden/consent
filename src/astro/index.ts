// Build-time entry: the Astro integration and validateConfig, so zod never reaches the browser
// entry (decision #10).

export { default, type ConsentIntegrationOptions } from "./integration.js";
export { validateConfig, type ValidationIssue, type ValidationResult } from "./validate.js";
export type { ConsentConfig, LocaleStrings, ThemeColor } from "./schema.js";
export type { ConsentRecord, ConsentRecorder } from "../core/types.js";

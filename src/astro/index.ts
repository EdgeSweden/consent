// Build-time entry. The Astro integration itself arrives in P1.6; validateConfig is exported here
// so zod never reaches the browser entry (decision #10).

export { validateConfig, type ValidationIssue, type ValidationResult } from "./validate.js";
export type { ConsentConfig, LocaleStrings, ThemeColor } from "./schema.js";
export type { ConsentRecord, ConsentRecorder } from "../core/types.js";

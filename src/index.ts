// Public entry for the browser core. mount() and openSettings() are exported once the record hook
// (P1.5) and link tokens (P1.4) complete the contract, so the entry never offers a consent
// mechanism that silently ignores part of a valid config (decision #26).
export { getConsent, onConsent, withdraw } from "./core/state.js";
export type { ConsentRecord, ConsentRecorder, ConsentState } from "./core/types.js";

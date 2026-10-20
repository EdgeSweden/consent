// Public entry for the browser core. mount() and openSettings() are exported with the banner in
// P1.3, so the entry never offers a consent mechanism without its UI.
export { getConsent, onConsent, withdraw } from "./core/state.js";
export type { ConsentRecord, ConsentRecorder, ConsentState } from "./core/types.js";

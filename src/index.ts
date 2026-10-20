// Public entry for the browser core.
export { mount } from "./core/mount.js";
export { getConsent, onConsent, withdraw } from "./core/state.js";
export { openSettings } from "./core/ui.js";
export type { ConsentRecord, ConsentRecorder, ConsentState } from "./core/types.js";

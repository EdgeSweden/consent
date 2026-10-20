// Plan: Mount. Establishes the consent state, then builds the banner and settings dialog.

import type { ConsentConfig } from "../astro/schema.js";
import { mount as mountState } from "./state.js";
import { mountUi } from "./ui.js";

/** Idempotent: a second call is a no-op whichever document it is given (decision #18). */
export function mount(config: ConsentConfig, doc: Document = document): void {
  mountState(config, doc);
  mountUi(config, doc);
}

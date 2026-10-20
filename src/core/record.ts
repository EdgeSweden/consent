// Plan: Record. Hands the record of a choice to the configured recorder (decision #33). A failure
// never reaches the visitor or the caller.

import type { ConsentConfig } from "../astro/schema.js";
import type { ConsentAction, ConsentRecord, ConsentState } from "./types.js";
import { isRecordUrl } from "./urls.js";

declare const __PACKAGE_VERSION__: string;

const ignore = (): void => {};

/**
 * Posts the record as a JSON string, so it goes out as `text/plain;charset=UTF-8` and a
 * cross-origin URL needs no preflight. Falls back to a keepalive `fetch` when `sendBeacon` is
 * missing (calling it throws), refuses the payload or throws.
 */
function post(url: string, body: string): void {
  try {
    if (navigator.sendBeacon(url, body)) return;
  } catch {
    // fall through to fetch
  }
  try {
    fetch(url, { method: "POST", keepalive: true, body }).catch(ignore);
  } catch {
    // no transport: the record is dropped
  }
}

/** Records a state-establishing or state-changing choice; `state.at` is the stored timestamp. */
export function record(
  config: ConsentConfig,
  action: ConsentAction,
  state: ConsentState & { at: number },
): void {
  const recorder = config.record;
  if (recorder === undefined) return;
  // ConsentState carries exactly the record's other keys.
  const payload: ConsentRecord = {
    action,
    ...state,
    categories: { ...state.categories },
    packageVersion: __PACKAGE_VERSION__,
  };
  if (typeof recorder === "string") {
    if (isRecordUrl(recorder)) post(recorder, JSON.stringify(payload));
    return;
  }
  try {
    Promise.resolve(recorder(payload)).catch(ignore);
  } catch {
    // a throwing recorder must not undo or interrupt the choice
  }
}

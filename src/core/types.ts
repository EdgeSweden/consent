// Types shared by the browser core and the build-time config schema. Type-only: no runtime code.

/** The payload passed to `record` after a state-establishing or state-changing choice. */
export interface ConsentRecord {
  action: "accept_all" | "reject_all" | "custom" | "withdraw";
  categories: Record<string, boolean>;
  policyVersion: string;
  packageVersion: string;
  locale: string;
  /** Unix seconds. */
  at: number;
}

export type ConsentRecorder = (record: ConsentRecord) => void | Promise<void>;

// Two errors (wrong schema version, a key from v0.2.0) and one contrast warning.
import config from "./valid.config.js";

export default {
  ...config,
  schemaVersion: 2,
  consentMode: { mapping: {} },
  theme: { colors: { background: "#ffffff", text: "#eeeeee" } },
};

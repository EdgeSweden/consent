// Two errors (wrong schema version, an unknown key) and one contrast warning.
import config from "./valid.config.js";

export default {
  ...config,
  schemaVersion: 2,
  gpc: true,
  theme: { colors: { background: "#ffffff", text: "#eeeeee" } },
};

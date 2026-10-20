// URL rules shared by build-time validation and the browser core, so the runtime can apply the same
// checks to a config that never went through validateConfig. Zod-free (AGENTS.md: Safety).

/** `/path`, but not the scheme-relative `//host` or `/\host` that browsers treat alike. */
function isRootRelative(value: string): boolean {
  return value.startsWith("/") && !/^\/[/\\]/.test(value);
}

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// The URL parser strips tab, LF and CR anywhere, so "/\t/host" would resolve off-site.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL = /[\u0000-\u001F\u007F]/;

/** Plan: Validation, `record`. */
export function isRecordUrl(value: string): boolean {
  return !CONTROL.test(value) && (isRootRelative(value) || isHttpUrl(value));
}

/** Decision #12. */
export function isLinkHref(value: string): boolean {
  return (
    !CONTROL.test(value) && (isRootRelative(value) || isHttpUrl(value) || value.startsWith("#"))
  );
}

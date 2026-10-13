/**
 * Returns `target` only when it is a same-origin absolute path; otherwise
 * `fallback`. Prevents open redirects through `?next=` parameters.
 */
export function safeRedirectPath(target: string | null | undefined, fallback = "/"): string {
  if (!target || !target.startsWith("/")) return fallback;
  // Protocol-relative ("//evil.com") and backslash variants ("/\evil.com").
  if (target.startsWith("//") || target.startsWith("/\\")) return fallback;

  try {
    const base = "http://internal.invalid";
    const url = new URL(target, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

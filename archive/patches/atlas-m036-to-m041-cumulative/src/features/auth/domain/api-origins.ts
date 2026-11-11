export const MAX_ALLOWED_ORIGINS = 20;

export type OriginsResult = { ok: true; origins: string[] } | { ok: false; message: string };

/**
 * Mission 037 — validates and normalizes the browser origins a business
 * allows to use its public API key. Accepts `https://example.com` style
 * entries (http only for localhost), strips trailing slashes, rejects
 * paths/queries, dedupes. Returning `url.origin` guarantees the stored
 * value is exactly what a browser sends in the `Origin` header.
 */
export function normalizeAllowedOrigins(input: string[]): OriginsResult {
  const origins: string[] = [];
  for (const raw of input) {
    const value = raw.trim();
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return { ok: false, message: `"${value}" is not a valid origin. Use the form https://yourdomain.com.` };
    }
    // Browsers never send wildcard or oddly-shaped hosts; a stored one could never match and only misleads the owner.
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname) && !/^\[[0-9a-f:]+\]$/i.test(url.hostname)) {
      return { ok: false, message: `"${value}" is not a valid site address (wildcards aren't supported).` };
    }
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
      return { ok: false, message: `"${value}" must use https (http is only allowed for localhost).` };
    }
    if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash || url.username || url.password) {
      return { ok: false, message: `"${value}" must be just the site address, with no path.` };
    }
    if (!origins.includes(url.origin)) origins.push(url.origin);
  }
  if (origins.length > MAX_ALLOWED_ORIGINS) {
    return { ok: false, message: `At most ${MAX_ALLOWED_ORIGINS} origins are allowed.` };
  }
  return { ok: true, origins };
}

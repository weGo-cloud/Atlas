/** Messenger allows ~2000 chars and Instagram ~1000 bytes per message; stay well under both. */
export const META_MESSAGE_CHUNK = 900;
const MAX_PARTS = 3;

/** Splits a long reply into at most 3 messages, preferring paragraph/sentence boundaries. Pure: no I/O. */
export function splitForMeta(text: string, max = META_MESSAGE_CHUNK, maxParts = MAX_PARTS): string[] {
  const clean = text.trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > max && parts.length < maxParts - 1) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
    const at = cut > max * 0.4 ? cut + 1 : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest.length > max ? `${rest.slice(0, max - 1).trimEnd()}…` : rest);
  return parts;
}

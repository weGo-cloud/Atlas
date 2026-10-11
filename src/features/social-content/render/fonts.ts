import { INTER_400_WOFF_BASE64, INTER_700_WOFF_BASE64 } from "./fonts-data";

/**
 * Mission 034 — Inter (SIL OFL), decoded from the base64 constants in
 * fonts-data.ts. See that file's comment for why the bytes are
 * embedded rather than read from disk at runtime.
 */
let cached: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] | null = null;

export function loadBrandFonts() {
  if (cached) return cached;
  cached = [
    { name: "Inter", data: Buffer.from(INTER_400_WOFF_BASE64, "base64"), weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: Buffer.from(INTER_700_WOFF_BASE64, "base64"), weight: 700 as const, style: "normal" as const },
  ];
  return cached;
}

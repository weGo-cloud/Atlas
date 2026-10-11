import { BRAND } from "../brand";
import type { TemplateNode } from "../render-engine";

/** Truncates to a max length on a word boundary where possible — long real item names/values must never overflow the fixed 1080x1080 canvas. */
export function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Every template's logo mark — the same rounded tile + "A" glyph used across the M032 UI (components/shared/logo.tsx), redrawn here since satori can't render that component directly. */
export function logoMark(): TemplateNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", alignItems: "center", gap: 10 },
      children: [
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              width: 34,
              height: 34,
              borderRadius: 9,
              background: BRAND.primaryStrong,
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: 18,
              fontWeight: 700,
            },
            children: "A",
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", color: BRAND.foreground, fontSize: 15, fontWeight: 700, letterSpacing: 3 },
            children: "ATLAS",
          },
        },
      ],
    },
  };
}

export function statusBadge(label: string): TemplateNode {
  return {
    type: "div",
    props: {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        borderRadius: 999,
        background: "rgba(62,207,142,0.16)",
        color: BRAND.success,
        fontSize: 22,
        fontWeight: 700,
      },
      children: [
        { type: "div", props: { style: { display: "flex", width: 10, height: 10, borderRadius: 999, background: BRAND.success }, children: [] } },
        clampText(label, 20),
      ],
    },
  };
}

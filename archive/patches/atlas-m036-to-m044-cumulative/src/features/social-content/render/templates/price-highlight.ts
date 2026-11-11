import { BRAND } from "../brand";
import type { TemplateInput } from "../../domain/template-input";
import type { TemplateNode } from "../render-engine";
import { clampText, logoMark, statusBadge } from "./shared";

/** Photo on top, a bold price treatment below — for a deal / price-drop style post. */
export function renderPriceHighlight(input: TemplateInput, photoDataUrl: string): TemplateNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", background: BRAND.background, fontFamily: "Inter" },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "32px 40px 0" },
            children: [logoMark(), statusBadge(input.availabilityLabel)],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", width: 1000, height: 560, margin: "28px 40px 0", borderRadius: 24, overflow: "hidden" },
            children: [{ type: "img", props: { src: photoDataUrl, style: { width: "100%", height: "100%", objectFit: "cover" } } }],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "36px 40px 0" },
            children: [
              { type: "div", props: { style: { display: "flex", color: BRAND.muted, fontSize: 24, fontWeight: 400 }, children: clampText(input.itemLabel, 46) } },
              { type: "div", props: { style: { display: "flex", color: BRAND.foreground, fontSize: 76, fontWeight: 700, letterSpacing: -1 }, children: clampText(input.priceLabel, 22) } },
            ],
          },
        },
      ],
    },
  };
}

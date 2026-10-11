import { BRAND } from "../brand";
import type { TemplateInput } from "../../domain/template-input";
import type { TemplateNode } from "../render-engine";
import { clampText, logoMark, statusBadge } from "./shared";

/** Photo alongside up to 4 key specs — for shoppers who scan for detail. Specs are capped at 4 by the caller (template-service.ts); this template only ever lays out what it's given. */
export function renderSpecsCard(input: TemplateInput, photoDataUrl: string): TemplateNode {
  const specRows: TemplateNode[] = input.specs.slice(0, 4).map(([label, value]) => ({
    type: "div",
    props: {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "16px 0",
        borderTop: `1px solid ${BRAND.border}`,
        fontSize: 24,
      },
      children: [
        { type: "div", props: { style: { display: "flex", color: BRAND.muted }, children: clampText(label, 22) } },
        { type: "div", props: { style: { display: "flex", color: BRAND.foreground, fontWeight: 700 }, children: clampText(value, 26) } },
      ],
    },
  }));

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
            style: { display: "flex", width: 1000, height: 460, margin: "24px 40px 0", borderRadius: 20, overflow: "hidden" },
            children: [{ type: "img", props: { src: photoDataUrl, style: { width: "100%", height: "100%", objectFit: "cover" } } }],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 2, padding: "28px 40px 0" },
            children: [
              { type: "div", props: { style: { display: "flex", color: BRAND.foreground, fontSize: 34, fontWeight: 700 }, children: clampText(input.itemLabel, 40) } },
              { type: "div", props: { style: { display: "flex", color: BRAND.primary, fontSize: 28, fontWeight: 700 }, children: clampText(input.priceLabel, 24) } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", margin: "8px 40px 0" },
            children: specRows.length > 0 ? specRows : [{ type: "div", props: { style: { display: "flex", color: BRAND.muted, fontSize: 22, padding: "16px 0" }, children: "No additional specs on file." } }],
          },
        },
      ],
    },
  };
}

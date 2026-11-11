import { BRAND } from "../brand";
import type { TemplateInput } from "../../domain/template-input";
import type { TemplateNode } from "../render-engine";
import { clampText, logoMark, statusBadge } from "./shared";

/** Full-bleed photo, name + price + status overlaid at the bottom — a clean general-purpose post. */
export function renderFeaturedItem(input: TemplateInput, photoDataUrl: string): TemplateNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", flexDirection: "column", width: "100%", height: "100%", background: BRAND.background, fontFamily: "Inter" },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", position: "relative", width: "100%", flex: 1 },
            children: [
              { type: "img", props: { src: photoDataUrl, style: { width: "100%", height: "100%", objectFit: "cover" } } },
              {
                type: "div",
                props: {
                  style: { display: "flex", position: "absolute", top: 32, left: 32 },
                  children: [logoMark()],
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", position: "absolute", top: 32, right: 32 },
                  children: [statusBadge(input.availabilityLabel)],
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(15,26,46,0) 55%, rgba(15,26,46,0.92) 100%)",
                  },
                  children: [],
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 10, padding: "40px 44px 48px" },
            children: [
              { type: "div", props: { style: { display: "flex", color: BRAND.foreground, fontSize: 46, fontWeight: 700, lineHeight: 1.15 }, children: clampText(input.itemLabel, 42) } },
              { type: "div", props: { style: { display: "flex", color: BRAND.primary, fontSize: 40, fontWeight: 700 }, children: clampText(input.priceLabel, 24) } },
            ],
          },
        },
      ],
    },
  };
}

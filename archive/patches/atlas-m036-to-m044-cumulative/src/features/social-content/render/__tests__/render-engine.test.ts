import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";

import { POST_IMAGE_HEIGHT, POST_IMAGE_WIDTH, type TemplateInput } from "../../domain/template-input";
import { RenderError, renderTemplateToPng } from "../render-engine";

const dir = mkdtempSync(path.join(tmpdir(), "atlas-social-render-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function makePhoto(name: string): string {
  const png = new PNG({ width: 40, height: 30 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 120;
    png.data[i + 1] = 90;
    png.data[i + 2] = 60;
    png.data[i + 3] = 255;
  }
  const filePath = path.join(dir, name);
  writeFileSync(filePath, PNG.sync.write(png));
  return filePath;
}

function baseInput(overrides: Partial<TemplateInput> = {}): TemplateInput {
  return {
    templateId: "featured_item",
    itemLabel: "2021 Toyota Vitz",
    priceLabel: "KSh 1,800,000",
    availabilityLabel: "Available",
    specs: [["Mileage", "45,000 km"]],
    photoPath: makePhoto("base.png"),
    ...overrides,
  };
}

describe("renderTemplateToPng", () => {
  it("produces a real PNG at the expected 1080x1080 dimensions for every template", async () => {
    for (const templateId of ["featured_item", "price_highlight", "specs_card"] as const) {
      const png = await renderTemplateToPng(baseInput({ templateId }));
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // real PNG signature
      const decoded = PNG.sync.read(png);
      expect(decoded.width).toBe(POST_IMAGE_WIDTH);
      expect(decoded.height).toBe(POST_IMAGE_HEIGHT);
    }
  });

  it("does not throw on a very long item name or price (containment, not a crash)", async () => {
    const png = await renderTemplateToPng(
      baseInput({
        itemLabel: "Mercedes-Benz-AMG-Performance-Division GLE 63 S 4MATIC+ Coupé Edition Superleggera Limited Anniversary Package",
        priceLabel: "KSh 987,654,321",
      })
    );
    expect(PNG.sync.read(png).width).toBe(POST_IMAGE_WIDTH);
  });

  it("renders specs_card with zero, one, and four specs without throwing", async () => {
    const specsCases: TemplateInput["specs"][] = [
      [],
      [["Material", "Oak"]],
      [
        ["Material", "Oak"],
        ["Color", "Grey"],
        ["Dimensions", "180x90x75cm"],
        ["Condition", "New"],
      ],
    ];
    for (const specs of specsCases) {
      const png = await renderTemplateToPng(baseInput({ templateId: "specs_card", specs }));
      expect(PNG.sync.read(png).width).toBe(POST_IMAGE_WIDTH);
    }
  });

  it("refuses to render when the photo file doesn't exist — never substitutes a placeholder", async () => {
    await expect(renderTemplateToPng(baseInput({ photoPath: path.join(dir, "does-not-exist.png") }))).rejects.toThrow(RenderError);
  });

  it("refuses to render when the photo isn't a supported image format", async () => {
    const badPath = path.join(dir, "not-an-image.png");
    writeFileSync(badPath, Buffer.from("this is not image data at all"));
    await expect(renderTemplateToPng(baseInput({ photoPath: badPath }))).rejects.toThrow(RenderError);
  });

  it("rejects an unknown template id", async () => {
    await expect(renderTemplateToPng(baseInput({ templateId: "nonexistent" as never }))).rejects.toThrow(RenderError);
  });
});

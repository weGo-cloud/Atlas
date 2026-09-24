import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiGenerationError,
  AnthropicContentGenerator,
  TemplateContentGenerator,
  getContentGenerator,
} from "../content-generator";
import type { GroundedFacts } from "../../domain/grounded-facts";

function facts(): GroundedFacts {
  return {
    itemLabel: "2021 Toyota Vitz",
    priceLabel: "KSh 1,800,000",
    availabilityLabel: "Available",
    category: null,
    condition: null,
    description: "Well maintained.",
    attributes: { Mileage: "45,000 km" },
  };
}

const originalFetch = global.fetch;
const originalEnv = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  if (originalEnv === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalEnv;
  vi.restoreAllMocks();
});

describe("getContentGenerator (Mission 031, Section 4/17 — never silently pretend AI ran)", () => {
  it("selects TemplateContentGenerator when no API key is configured", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(getContentGenerator()).toBeInstanceOf(TemplateContentGenerator);
  });

  it("selects AnthropicContentGenerator when a key is configured", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(getContentGenerator()).toBeInstanceOf(AnthropicContentGenerator);
  });
});

describe("TemplateContentGenerator", () => {
  it("labels its output method as 'template', never 'ai'", async () => {
    const result = await new TemplateContentGenerator().generateBlurb(facts());
    expect(result.method).toBe("template");
    expect(result.blurb.length).toBeGreaterThan(0);
  });
});

describe("AnthropicContentGenerator", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("calls api.anthropic.com/v1/messages with the api key header, and labels the result 'ai' on success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "text", text: "A great little runabout." }] }),
    });

    const generator = new AnthropicContentGenerator("test-key");
    const result = await generator.generateBlurb(facts());

    expect(result.method).toBe("ai");
    expect(result.blurb).toBe("A great little runabout.");

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body.system).toMatch(/only.*facts|do not invent/i);
    expect(body.messages[0].content).toContain("2021 Toyota Vitz");
  });

  it("throws AiGenerationError (not a fabricated response) when the network request fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const generator = new AnthropicContentGenerator("test-key");
    await expect(generator.generateBlurb(facts())).rejects.toBeInstanceOf(AiGenerationError);
  });

  it("throws AiGenerationError on a 401 (bad/missing key), without leaking the raw response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "invalid x-api-key" } }),
    });
    const generator = new AnthropicContentGenerator("bad-key");
    await expect(generator.generateBlurb(facts())).rejects.toThrow(/not properly configured/i);
  });

  it("throws AiGenerationError when the response has no usable text block", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    });
    const generator = new AnthropicContentGenerator("test-key");
    await expect(generator.generateBlurb(facts())).rejects.toBeInstanceOf(AiGenerationError);
  });
});

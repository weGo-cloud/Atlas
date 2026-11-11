import { afterEach, describe, expect, it, vi } from "vitest";

import type { LlmRequest } from "../llm-client";
import { LlmUnavailableError } from "../llm-client";
import { DEFAULT_GEMINI_MODEL, GeminiLlmClient } from "../gemini-llm-client";
import { createAssistantLlmClient } from "../index";
import { AnthropicLlmClient } from "../anthropic-llm-client";

const request: LlmRequest = {
  system: "Be helpful.",
  messages: [
    { role: "user", content: "Find sofas" },
    {
      role: "assistant",
      content: [{ type: "tool_use", id: "call_1", name: "search_inventory", input: { query: "sofa" } }],
    },
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "call_1", content: "{\"items\":[]}" }],
    },
  ],
  tools: [
    {
      name: "search_inventory",
      description: "Search inventory.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          filters: { type: "object", properties: { active: { type: "boolean" } }, additionalProperties: false },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  ],
  maxTokens: 512,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GeminiLlmClient", () => {
  it("sends provider-neutral messages and tools to Gemini, then maps function calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "I found some options." },
                  { functionCall: { id: "gcall_1", name: "get_item", args: { id: "item_1" } } },
                ],
              },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await new GeminiLlmClient("test-key").complete(request);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("test-key");
    expect(url).not.toContain("test-key");

    const body = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
      tools: Array<{ functionDeclarations: Array<{ parameters: Record<string, unknown> }> }>;
      generationConfig: { maxOutputTokens: number };
    };
    expect(body.systemInstruction.parts[0].text).toBe(request.system);
    expect(body.contents.map((entry) => entry.role)).toEqual(["user", "model", "user"]);
    expect(body.contents[1].parts[0]).toMatchObject({ functionCall: { id: "call_1", name: "search_inventory" } });
    expect(body.contents[2].parts[0]).toMatchObject({
      functionResponse: { id: "call_1", name: "search_inventory", response: { result: "{\"items\":[]}" } },
    });
    expect(body.tools[0].functionDeclarations[0].parameters).toMatchObject({
      type: "OBJECT",
      properties: { query: { type: "STRING" }, filters: { type: "OBJECT", properties: { active: { type: "BOOLEAN" } } } },
      required: ["query"],
    });
    expect(body.generationConfig.maxOutputTokens).toBe(512);
    expect(response).toEqual({
      content: [
        { type: "text", text: "I found some options." },
        { type: "tool_use", id: "gcall_1", name: "get_item", input: { id: "item_1" } },
      ],
      stopReason: "tool_use",
    });
  });

  it("creates a stable local id when a function call response omits one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "count_by_status", args: {} } }] }, finishReason: "FUNCTION_CALL" }] }), {
          status: 200,
        })
      )
    );
    const response = await new GeminiLlmClient("test-key").complete(request);
    expect(response.stopReason).toBe("tool_use");
    expect(response.content[0]).toMatchObject({ type: "tool_use", id: "gemini_call_0", name: "count_by_status" });
  });

  it("does not expose provider failures or raw error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("sensitive provider detail", { status: 429 })));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(new GeminiLlmClient("test-key").complete(request)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(log).toHaveBeenCalledWith("Gemini model request failed with status 429");
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("sensitive"));
  });
});

describe("createAssistantLlmClient", () => {
  it("prefers Gemini when its key is configured", () => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-test-model");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key");
    expect(createAssistantLlmClient()).toBeInstanceOf(GeminiLlmClient);
  });

  it("retains Anthropic as a fallback for existing deployments", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-test-key");
    expect(createAssistantLlmClient()).toBeInstanceOf(AnthropicLlmClient);
  });

  it("returns no client when neither provider key is configured", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(createAssistantLlmClient()).toBeNull();
  });
});

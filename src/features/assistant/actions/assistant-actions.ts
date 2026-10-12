"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { MAX_CUSTOMER_MESSAGE_CHARS, type AssistantTone, type ConversationState, type ProductCard } from "../domain/types";
import { getAssistantService } from "../service/assistant-service";

const STATES: ConversationState[] = ["bot", "human", "closed"];

function field(formData: FormData, name: string, max: number): string | null {
  const value = formData.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed === "" ? null : trimmed;
}

export async function setConversationStateAction(formData: FormData): Promise<void> {
  const { business } = await requireCurrentSession();
  const id = field(formData, "conversationId", 80);
  const state = field(formData, "state", 10) as ConversationState | null;
  if (!id || !state || !STATES.includes(state)) return;
  await getAssistantService(business.id, { llm: null }).repo.updateConversation(id, { state });
  revalidatePath("/app/assistant");
}

export async function deleteConversationAction(formData: FormData): Promise<void> {
  const { business } = await requireCurrentSession();
  const id = field(formData, "conversationId", 80);
  if (!id) return;
  await getAssistantService(business.id, { llm: null }).repo.deleteConversation(id);
  revalidatePath("/app/assistant");
  redirect("/app/assistant");
}

export async function saveAssistantSettingsAction(formData: FormData): Promise<void> {
  const { business } = await requireCurrentSession();
  const tone: AssistantTone = formData.get("tone") === "formal" ? "formal" : "friendly";
  await getAssistantService(business.id, { llm: null }).repo.saveSettings({
    assistantEnabled: formData.get("assistantEnabled") === "on",
    displayName: field(formData, "displayName", 100),
    openingHours: field(formData, "openingHours", 300),
    location: field(formData, "location", 300),
    deliveryPolicy: field(formData, "deliveryPolicy", 600),
    paymentMethods: field(formData, "paymentMethods", 300),
    greeting: field(formData, "greeting", 300),
    tone,
    handoffTopics: field(formData, "handoffTopics", 300),
    whatsappPhoneNumberId: field(formData, "whatsappPhoneNumberId", 60),
  });
  revalidatePath("/app/assistant");
  redirect("/app/assistant/settings?saved=1");
}

export type DemoMessageResult =
  | { ok: true; conversationId: string; reply: string | null; products: ProductCard[]; state: string }
  | { ok: false; error: string };

/**
 * The demo simulator's transport: the *same engine, real model, real
 * inventory, real leads* as the live channels, entered through the
 * "simulated" channel so transcripts and leads are clearly labelled.
 */
export async function sendDemoMessageAction(input: { text: string; conversationId: string | null; sessionKey: string }): Promise<DemoMessageResult> {
  const { user, business } = await requireCurrentSession();
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return { ok: false, error: "Type a message first." };
  if (text.length > MAX_CUSTOMER_MESSAGE_CHARS) return { ok: false, error: `Messages are limited to ${MAX_CUSTOMER_MESSAGE_CHARS} characters.` };
  if (!/^[a-z0-9]{6,40}$/i.test(input.sessionKey)) return { ok: false, error: "Invalid session." };

  const outcome = await getAssistantService(business.id).handleCustomerMessage({
    channel: "simulated",
    customerKey: `demo_${user.id}_${input.sessionKey}`,
    conversationId: input.conversationId,
    text,
  });
  revalidatePath("/app/assistant");
  if (!outcome.ok) {
    return {
      ok: false,
      error:
        outcome.reason === "not_configured"
          ? "The AI isn't configured (ANTHROPIC_API_KEY is missing)."
          : outcome.reason === "disabled"
            ? "The assistant is switched off in Assistant settings."
            : "The assistant isn't available for this business.",
    };
  }
  const { result } = outcome;
  return { ok: true, conversationId: result.conversationId, reply: result.reply, products: result.products, state: result.state };
}

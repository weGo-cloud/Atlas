"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import type { EverestError } from "../domain/types";
import { getEverestService } from "../service";
import type { ConversationState, EverestOverview } from "../service/everest-service";

export type EverestActionResult = { ok: true; state: ConversationState } | { ok: false; error: EverestError };

async function context() {
  const { user, business } = await requireCurrentSession();
  return { service: getEverestService(business), actor: { userId: user.id, role: user.role } };
}

function toResult(result: { ok: true; data: ConversationState } | { ok: false; error: EverestError }): EverestActionResult {
  return result.ok ? { ok: true, state: result.data } : { ok: false, error: result.error };
}

/** Sends one message to Everest. The signed-in user and business come from the session, never from the client. */
export async function sendEverestMessageAction(conversationId: string | null, text: string): Promise<EverestActionResult> {
  const { service, actor } = await context();
  return toResult(await service.sendMessage(actor, conversationId, text, new Date()));
}

/** The Confirm button: the only path by which a proposed change is carried out. */
export async function confirmEverestActionAction(pendingActionId: string): Promise<EverestActionResult> {
  const { service, actor } = await context();
  const result = await service.confirmPendingAction(actor, pendingActionId, new Date());
  if (result.ok) {
    revalidatePath("/app/inventory");
    revalidatePath("/app/dashboard");
    revalidatePath("/app/analytics");
  }
  return toResult(result);
}

export async function cancelEverestActionAction(pendingActionId: string): Promise<EverestActionResult> {
  const { service, actor } = await context();
  return toResult(await service.cancelPendingAction(actor, pendingActionId, new Date()));
}

/** Re-reads a conversation (used after an expired or already-handled confirm so the card shows its true state). */
export async function refreshEverestStateAction(conversationId: string | null): Promise<EverestActionResult> {
  const { service, actor } = await context();
  return { ok: true, state: await service.getState(actor, conversationId, new Date()) };
}

/** Loads the panel's starting state the first time it is opened (the panel is on every page, so nothing is fetched until then). */
export async function getEverestOverviewAction(): Promise<{ ok: true; overview: EverestOverview } | { ok: false; message: string }> {
  try {
    const { service, actor } = await context();
    return { ok: true, overview: await service.getOverview(actor, null, new Date()) };
  } catch (error) {
    console.error("Everest overview failed", error);
    return { ok: false, message: "Everest could not be loaded. Refresh the page and try again." };
  }
}

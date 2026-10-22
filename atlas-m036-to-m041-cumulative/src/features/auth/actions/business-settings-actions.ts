"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "../lib/current-session";
import { ForbiddenError, requirePermission } from "../domain/permissions";
import { DatabaseBusinessRepository } from "../repository/database-business-repository";
import type { Business, WebsiteMode } from "../domain/business";
import { normalizeAllowedOrigins } from "../domain/api-origins";
import { generatePublicApiKey } from "@/lib/security/api-key";

export type BusinessSettingsActionResult =
  | { ok: true; business: Business; /** Mission 037 — present ONLY on key generation/rotation: the one time the plaintext key is ever shown. */ newApiKey?: string }
  | { ok: false; error: { message: string } };

/**
 * Mission 027 (correction) / Mission 028 — every business-level
 * conversion-layer setting a dealer/owner can change is funneled
 * through this one repository call (BusinessRepository.updateSettings),
 * the same "one write path" discipline every other settings-style
 * mutation in Atlas already follows. All three actions below require
 * `business.manage` (owner-only, see permissions.ts) — the same
 * defense-in-depth pattern (requireCurrentSession → requirePermission
 * → repository) as every other consequential action in the codebase.
 *
 * Plan/subscription changes are deliberately NOT here — see
 * entitlements/repository/subscription-repository.ts. This file only
 * ever writes `businesses` columns (websiteMode, public API key hash, allowed origins), never
 * `subscriptions` columns, matching Mission 028's plan-vs-subscription
 * separation of concerns at the write-path level too, not just the
 * schema level.
 */
async function requireBusinessManage() {
  const session = await requireCurrentSession();
  try {
    requirePermission(session, "business.manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw new PermissionDenied(error.message);
    }
    throw error;
  }
  return session;
}

class PermissionDenied extends Error {}

export async function setWebsiteModeAction(mode: WebsiteMode): Promise<BusinessSettingsActionResult> {
  let session;
  try {
    session = await requireBusinessManage();
  } catch (error) {
    if (error instanceof PermissionDenied) return { ok: false, error: { message: error.message } };
    throw error;
  }

  const repository = new DatabaseBusinessRepository();
  const business = await repository.updateSettings(session.business.id, { websiteMode: mode });
  if (!business) return { ok: false, error: { message: "Business not found." } };

  revalidatePath("/app/settings");
  return { ok: true, business };
}

export async function regeneratePublicApiKeyAction(): Promise<BusinessSettingsActionResult> {
  let session;
  try {
    session = await requireBusinessManage();
  } catch (error) {
    if (error instanceof PermissionDenied) return { ok: false, error: { message: error.message } };
    throw error;
  }

  const apiKey = generatePublicApiKey();
  const repository = new DatabaseBusinessRepository();
  const business = await repository.setPublicApiKey(session.business.id, apiKey);
  if (!business) return { ok: false, error: { message: "Business not found." } };

  revalidatePath("/app/settings");
  return { ok: true, business, newApiKey: apiKey };
}

export async function revokePublicApiKeyAction(): Promise<BusinessSettingsActionResult> {
  let session;
  try {
    session = await requireBusinessManage();
  } catch (error) {
    if (error instanceof PermissionDenied) return { ok: false, error: { message: error.message } };
    throw error;
  }

  const repository = new DatabaseBusinessRepository();
  const business = await repository.clearPublicApiKey(session.business.id);
  if (!business) return { ok: false, error: { message: "Business not found." } };

  revalidatePath("/app/settings");
  return { ok: true, business };
}

/** Mission 037 — which browser origins may use the public API key (owner-only, like the other settings). */
export async function setPublicApiOriginsAction(origins: string[]): Promise<BusinessSettingsActionResult> {
  let session;
  try {
    session = await requireBusinessManage();
  } catch (error) {
    if (error instanceof PermissionDenied) return { ok: false, error: { message: error.message } };
    throw error;
  }

  const normalized = normalizeAllowedOrigins(origins);
  if (!normalized.ok) return { ok: false, error: { message: normalized.message } };

  const repository = new DatabaseBusinessRepository();
  const business = await repository.updateSettings(session.business.id, { publicApiAllowedOrigins: normalized.origins });
  if (!business) return { ok: false, error: { message: "Business not found." } };

  revalidatePath("/app/settings");
  return { ok: true, business };
}

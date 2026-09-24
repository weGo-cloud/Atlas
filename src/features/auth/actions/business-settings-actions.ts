"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "../lib/current-session";
import { ForbiddenError, requirePermission } from "../domain/permissions";
import { DatabaseBusinessRepository } from "../repository/database-business-repository";
import type { Business, WebsiteMode } from "../domain/business";

export type BusinessSettingsActionResult =
  | { ok: true; business: Business }
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
 * ever writes `businesses` columns (websiteMode, publicApiKey), never
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

  const apiKey = `wego_live_${randomBytes(24).toString("hex")}`;
  const repository = new DatabaseBusinessRepository();
  const business = await repository.updateSettings(session.business.id, { publicApiKey: apiKey });
  if (!business) return { ok: false, error: { message: "Business not found." } };

  revalidatePath("/app/settings");
  return { ok: true, business };
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
  const business = await repository.updateSettings(session.business.id, { publicApiKey: null });
  if (!business) return { ok: false, error: { message: "Business not found." } };

  revalidatePath("/app/settings");
  return { ok: true, business };
}

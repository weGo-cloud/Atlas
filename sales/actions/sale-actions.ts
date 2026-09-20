"use server";

import { revalidatePath } from "next/cache";

import { getActivityService } from "@/features/activities/service";
import type { SaleActivityMetadata } from "@/features/activities/domain/activity";
import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { ForbiddenError, requirePermission } from "@/features/auth/domain/permissions";
import { getDealService } from "@/features/deals/service";
import { getSaleService } from "../service";
import type { Sale } from "../domain/sale";
import type { SaleServiceError } from "../domain/errors";
import type { CreateSaleInput } from "../domain/sale-input";

export type SaleActionResult = { ok: true; sale: Sale } | { ok: false; error: SaleServiceError };

function revalidateSalePaths(sale: Sale) {
  revalidatePath("/app/sales");
  revalidatePath(`/app/sales/${sale.id}`);
  revalidatePath(`/app/customers/${sale.customerId}`);
  revalidatePath(`/app/deals/${sale.dealId}`);
  if (sale.vehicleId) {
    revalidatePath(`/app/inventory/${sale.vehicleId}`);
  }
  revalidatePath("/app/dashboard");
  revalidatePath("/app/analytics");
}

export async function createSaleAction(input: CreateSaleInput): Promise<SaleActionResult> {
  const session = await requireCurrentSession();

  // Mission 019, Section 19 — finalizing a sale is the most
  // consequential write in Atlas (see permissions.ts's `sale.create`
  // comment): owner only, same enforcement pattern as
  // vehicle.delete in vehicle-actions.ts.
  try {
    requirePermission(session, "sale.create");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { ok: false, error: { code: "FORBIDDEN", message: error.message } };
    }
    throw error;
  }

  const { business, user } = session;
  const result = await getSaleService(business.id).createSale(input);
  if (!result.ok) return { ok: false, error: result.error };

  // The originating deal's leadId, so this activity shows up on the
  // same Lead timeline deal_created/deal_status_changed already do —
  // best-effort lookup, never blocks the sale that already succeeded.
  const deal = await getDealService(business.id).getDeal(result.data.dealId);
  const leadId = deal.ok ? deal.data.leadId : null;

  try {
    await getActivityService(business.id).createActivity({
      customerId: result.data.customerId,
      leadId,
      userId: user.id,
      type: "sale_created",
      content: result.data.vehicleLabel
        ? `Sale finalized for ${result.data.vehicleLabel}.`
        : "Sale finalized.",
      metadata: { saleId: result.data.id, dealId: result.data.dealId } satisfies SaleActivityMetadata,
    });
  } catch {
    // Best-effort — see lead-actions.ts's recordActivity for the full
    // rationale, which applies identically here. The sale itself has
    // already succeeded; a missing activity entry is not a reason to
    // fail the request.
  }

  revalidateSalePaths(result.data);
  return { ok: true, sale: result.data };
}

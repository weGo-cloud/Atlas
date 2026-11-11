import { getEntitlementService } from "@/features/entitlements/service";
import { getPaymentService } from "./index";

/** Why an M-Pesa prompt can or can't be sent right now (plan + connected account). Shared by the deal and order pages. */
export async function getStkReadiness(businessId: string): Promise<{ ready: boolean; reason: string | null }> {
  const [account, entitlement] = await Promise.all([getPaymentService(businessId).getAccount(), getEntitlementService().canAccess(businessId, "mpesa_collection")]);
  if (!entitlement.allowed) return { ready: false, reason: "M-Pesa prompts need the Growth or Pro plan. You can still record M-Pesa payments below." };
  if (!account) return { ready: false, reason: "Connect your M-Pesa account in Settings to send payment prompts. You can still record payments below." };
  return { ready: true, reason: null };
}

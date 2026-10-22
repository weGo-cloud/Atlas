import { PaymentService, type PaymentServiceDeps } from "./payment-service";

/** Mission 040 — business-scoped factory, mirroring the other features' `getXService(businessId)`. */
export function getPaymentService(businessId: string, deps?: PaymentServiceDeps): PaymentService {
  return new PaymentService(businessId, deps);
}

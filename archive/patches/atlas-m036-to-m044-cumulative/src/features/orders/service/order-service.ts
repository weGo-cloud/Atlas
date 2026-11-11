import { DatabasePaymentRepository } from "@/features/payments/repository/database-payment-repository";
import { failOrder, okOrder, type FurnitureOrder, type FurnitureOrderWithLines, type OrderResult, type OrderStatus } from "../domain/order";
import { validateNewOrder, type NewOrderInput } from "../domain/validate-order-input";
import { DatabaseOrderRepository, type RepoResult } from "../repository/database-order-repository";

const fromRepo = <T,>(result: RepoResult<T>): OrderResult<T> => (result.ok ? okOrder(result.data) : failOrder({ code: result.code, message: result.message }));

/** Mission 042 — furniture order use-cases. Validation here, atomic rules in the repository, an audit event for every transition. */
export class OrderService {
  private readonly repo: DatabaseOrderRepository;
  private readonly events: DatabasePaymentRepository;

  constructor(readonly businessId: string) {
    this.repo = new DatabaseOrderRepository(businessId);
    this.events = new DatabasePaymentRepository(businessId);
  }

  async createDraft(input: NewOrderInput, actorUserId: string): Promise<OrderResult<FurnitureOrderWithLines>> {
    const validated = validateNewOrder(input);
    if (!validated.ok) return failOrder({ code: "VALIDATION_ERROR", message: "Please fix the highlighted fields.", fieldErrors: validated.fieldErrors });
    const result = fromRepo(await this.repo.createDraft(validated.value, actorUserId));
    if (result.ok) await this.events.recordEvent({ actorUserId, action: "order_created", detail: { orderId: result.data.id, reference: result.data.reference, total: result.data.total } });
    return result;
  }

  async confirm(id: string, actorUserId: string): Promise<OrderResult<FurnitureOrder>> {
    const result = fromRepo(await this.repo.confirm(id));
    if (result.ok) await this.events.recordEvent({ actorUserId, action: "order_confirmed", detail: { orderId: id, total: result.data.total } });
    return result;
  }

  async fulfil(id: string, actorUserId: string): Promise<OrderResult<FurnitureOrder>> {
    const result = fromRepo(await this.repo.fulfil(id));
    if (result.ok) await this.events.recordEvent({ actorUserId, action: "order_fulfilled", detail: { orderId: id } });
    return result;
  }

  async cancel(id: string, reasonRaw: string, actorUserId: string): Promise<OrderResult<FurnitureOrder>> {
    const reason = reasonRaw.trim();
    if (reason.length < 3) return failOrder({ code: "VALIDATION_ERROR", message: "Give a short reason for cancelling.", fieldErrors: { reason: "Give a short reason for cancelling." } });
    const result = fromRepo(await this.repo.cancel(id, reason.slice(0, 300)));
    if (result.ok) await this.events.recordEvent({ actorUserId, action: "order_cancelled", detail: { orderId: id, reason: reason.slice(0, 300) } });
    return result;
  }

  get(id: string) {
    return this.repo.getWithLines(id);
  }

  list(options: { limit: number; status?: OrderStatus; customerId?: string }) {
    return this.repo.list(options);
  }
}

export function getOrderService(businessId: string): OrderService {
  return new OrderService(businessId);
}

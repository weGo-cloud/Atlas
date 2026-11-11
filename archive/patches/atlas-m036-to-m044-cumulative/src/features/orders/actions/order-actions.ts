"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import type { OrderFieldErrors, OrderResult } from "../domain/order";
import { getOrderService } from "../service/order-service";

export type OrderActionResult<T = undefined> = { ok: true; message: string; data?: T } | { ok: false; error: { message: string; fieldErrors?: OrderFieldErrors } };

const idOf = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(v) ? v : null);

async function furnitureSession() {
  const session = await requireCurrentSession();
  return session.business.vertical === "furniture" ? session : null;
}

function wrap<T, D = undefined>(result: OrderResult<T>, message: string, map?: (data: T) => D): OrderActionResult<D> {
  return result.ok ? { ok: true, message, data: map ? map(result.data) : undefined } : { ok: false, error: { message: result.error.message, fieldErrors: result.error.fieldErrors } };
}

function refresh(id?: string) {
  revalidatePath("/app/orders");
  revalidatePath("/app/payments");
  revalidatePath("/app/inventory");
  if (id) revalidatePath(`/app/orders/${id}`);
}

export async function createOrderAction(input: Record<string, unknown>): Promise<OrderActionResult<{ id: string }>> {
  const session = await furnitureSession();
  if (!session) return { ok: false, error: { message: "Orders are for furniture businesses." } };
  const result = await getOrderService(session.business.id).createDraft(
    { customerId: input.customerId, lines: input.lines, deliveryFee: input.deliveryFee, discount: input.discount, deliveryAddress: input.deliveryAddress, deliveryDate: input.deliveryDate, notes: input.notes },
    session.user.id
  );
  if (result.ok) refresh();
  return wrap(result, "Order created.", (o) => ({ id: o.id }));
}

export async function confirmOrderAction(orderId: unknown): Promise<OrderActionResult> {
  const session = await furnitureSession();
  const id = idOf(orderId);
  if (!session || !id) return { ok: false, error: { message: "Order not found." } };
  const result = await getOrderService(session.business.id).confirm(id, session.user.id);
  if (result.ok) refresh(id);
  return wrap(result, "Order confirmed and stock reserved.");
}

export async function fulfilOrderAction(orderId: unknown): Promise<OrderActionResult> {
  const session = await furnitureSession();
  const id = idOf(orderId);
  if (!session || !id) return { ok: false, error: { message: "Order not found." } };
  const result = await getOrderService(session.business.id).fulfil(id, session.user.id);
  if (result.ok) refresh(id);
  return wrap(result, "Order marked as fulfilled.");
}

export async function cancelOrderAction(orderId: unknown, reason: unknown): Promise<OrderActionResult> {
  const session = await furnitureSession();
  const id = idOf(orderId);
  if (!session || !id) return { ok: false, error: { message: "Order not found." } };
  const result = await getOrderService(session.business.id).cancel(id, typeof reason === "string" ? reason : "", session.user.id);
  if (result.ok) refresh(id);
  return wrap(result, "Order cancelled.");
}

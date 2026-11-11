import { NextResponse } from "next/server";

/**
 * Mission 043 — Safaricom's optional pre-payment "validation" call. Atlas never blocks a customer's payment (registration uses
 * ResponseType "Completed"), so this answers "accepted" and does nothing else: no data is read, written or trusted.
 */
export async function POST() {
  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

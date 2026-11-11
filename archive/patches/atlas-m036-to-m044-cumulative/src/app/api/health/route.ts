import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * Mission 037 — liveness/readiness for Docker and uptime monitors. Proves the
 * process is up AND the database answers. Deliberately returns nothing else:
 * no config, versions, or counts.
 */
export async function GET() {
  try {
    db.get(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

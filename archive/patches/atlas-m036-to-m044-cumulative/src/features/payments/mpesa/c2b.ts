export type C2bNotification = {
  transId: string;
  amountRaw: string;
  /** Whole shillings, or null if the notification carried cents. */
  amountKes: number | null;
  billRef: string | null;
  phone: string | null;
  name: string | null;
  paidAt: string;
  shortcode: string | null;
};

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : null);

/** Strict parser for Daraja's C2B confirmation body. Anything malformed returns null and is dropped. */
export function parseC2bConfirmation(body: unknown): C2bNotification | null {
  const o = obj(body);
  if (!o) return null;
  const transId = str(o.TransID, 20)?.toUpperCase();
  if (!transId || !/^[A-Z0-9]{8,14}$/.test(transId)) return null;

  const amountRaw = str(o.TransAmount, 20);
  if (!amountRaw || !/^\d+(\.\d{1,2})?$/.test(amountRaw) || Number(amountRaw) <= 0) return null;
  const amountKes = /^\d+(\.0{1,2})?$/.test(amountRaw) ? Number.parseInt(amountRaw, 10) : null;

  let paidAt = new Date().toISOString();
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(str(o.TransTime, 14) ?? "");
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+03:00`);
    if (!Number.isNaN(d.getTime())) paidAt = d.toISOString();
  }
  const name = [o.FirstName, o.MiddleName, o.LastName].map((p) => str(p, 40)).filter(Boolean).join(" ") || null;
  const phoneRaw = str(o.MSISDN, 80);
  return {
    transId,
    amountRaw,
    amountKes,
    billRef: str(o.BillRefNumber, 60),
    phone: phoneRaw && /^\d{9,15}$/.test(phoneRaw) ? phoneRaw : null, // a hashed MSISDN is deliberately not kept as a phone number
    name,
    paidAt,
    shortcode: str(o.BusinessShortCode, 12),
  };
}

/** Normalizes an account reference for matching against an order reference: "ord 0007" / "ORD-0007" / "ord0007" all become ORD0007. */
export const normalizeRef = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

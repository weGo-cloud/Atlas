const numberFormatter = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });

/** Same "build the prefix manually" rationale as formatPriceKsh (inventory/lib/format.ts) — ICU currency-symbol rendering varies by environment. Falls back to the raw currency code for anything other than KES, since furniture products carry their own `currency` field rather than always being KES. */
export function formatFurniturePrice(amount: number, currency: string): string {
  if (currency === "KES") return `KSh ${numberFormatter.format(amount)}`;
  return `${currency} ${numberFormatter.format(amount)}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-KE", { day: "2-digit", month: "short", year: "numeric" });

export function formatAddedDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

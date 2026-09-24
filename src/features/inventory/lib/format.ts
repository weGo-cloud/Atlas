const numberFormatter = new Intl.NumberFormat("en-KE", {
  maximumFractionDigits: 0,
});

/**
 * Formats a number as Kenyan-shilling pricing, e.g. "KSh 3,850,000".
 * Builds the "KSh" prefix manually rather than via Intl's currency
 * symbol, since ICU locale data for KES varies by environment
 * (some builds render "Ksh" instead of "KSh").
 */
export function formatPriceKsh(amount: number): string {
  return `KSh ${numberFormatter.format(amount)}`;
}

const mileageFormatter = new Intl.NumberFormat("en-KE");

export function formatMileage(km: number): string {
  return `${mileageFormatter.format(km)} km`;
}

const dateFormatter = new Intl.DateTimeFormat("en-KE", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatAddedDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

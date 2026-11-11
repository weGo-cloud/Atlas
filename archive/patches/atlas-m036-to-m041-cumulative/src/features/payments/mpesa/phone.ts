/**
 * Normalizes a Kenyan mobile number to the 254XXXXXXXXX form Safaricom's APIs require.
 * Accepts 07xx/01xx, 7xx/1xx, 2547xx, +2547xx with spaces/dashes. Returns null for anything else
 * (landlines, foreign numbers, wrong length) so a typo never reaches the STK push.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  let national: string;
  if (digits.startsWith("254")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;
  return /^[17]\d{8}$/.test(national) ? `254${national}` : null;
}

/** Display form: 0712 345 678. */
export function formatKenyanPhone(normalized: string): string {
  const national = normalized.startsWith("254") ? `0${normalized.slice(3)}` : normalized;
  return national.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");
}

/**
 * Mission 027 (correction) — the shape a public submission arrives in,
 * whether it came through the Atlas-hosted storefront (a person
 * typing into a form) or the external-integration API (a dealer's own
 * website posting JSON). Both channels funnel into the same
 * ConversionService.submitPublicLead — this type, not two separate
 * ones, is what keeps that funnel real rather than superficial.
 */
export type PublicLeadInput = {
  name: string;
  phone: string;
  email?: string | null;
  message?: string | null;
  /** A CatalogItem.id the visitor was looking at, if any — see CatalogAdapter.resolveItemReference. */
  catalogItemId?: string | null;
};

export type PublicLeadChannel = "storefront" | "external_integration";

export type ConversionErrorCode =
  | "VALIDATION_ERROR"
  | "STOREFRONT_DISABLED"
  | "FORBIDDEN"
  | "BUSINESS_NOT_FOUND";

export type ConversionFieldErrors = Partial<Record<keyof PublicLeadInput, string>>;

export type ConversionServiceError = {
  code: ConversionErrorCode;
  message: string;
  fieldErrors?: ConversionFieldErrors;
};

export type ConversionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ConversionServiceError };

export function okConversion<T>(data: T): ConversionResult<T> {
  return { ok: true, data };
}

export function failConversion(error: ConversionServiceError): ConversionResult<never> {
  return { ok: false, error };
}

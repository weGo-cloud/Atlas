import type { CustomerFieldErrors } from "./errors";
import type { CreateCustomerInput, UpdateCustomerInput } from "./customer-input";

// Deliberately loose — accepts digits, spaces, +, -, (), of a
// plausible overall length. This is contact-info hygiene, not
// carrier/region validation.
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePhoneFormat(phone: string): string | undefined {
  if (!PHONE_PATTERN.test(phone.trim())) {
    return "Enter a valid phone number.";
  }
  return undefined;
}

function validateEmailFormat(email: string): string | undefined {
  if (!EMAIL_PATTERN.test(email.trim())) {
    return "Enter a valid email address.";
  }
  return undefined;
}

/**
 * Full validation, used on create. Name is required. Phone and email
 * are each individually optional — see schema.ts for the reasoning
 * against a uniqueness constraint — but at least one contact method
 * must be present: a customer record with neither is not reachable,
 * which defeats the purpose of tracking them at all.
 */
export function validateCreateCustomerInput(
  input: CreateCustomerInput
): CustomerFieldErrors {
  const errors: CustomerFieldErrors = {};

  if (!input.name.trim()) {
    errors.name = "Name is required.";
  }

  const phone = input.phone?.trim();
  const email = input.email?.trim();

  if (phone) {
    const phoneError = validatePhoneFormat(phone);
    if (phoneError) errors.phone = phoneError;
  }
  if (email) {
    const emailError = validateEmailFormat(email);
    if (emailError) errors.email = emailError;
  }

  if (!phone && !email) {
    errors.phone = "Provide at least a phone number or an email address.";
  }

  return errors;
}

/**
 * Partial validation, used on update. Only checks fields actually
 * supplied — but if the update would leave the customer with neither
 * phone nor email, that's still rejected (requires the caller to pass
 * the full current contact-info picture, same as any partial update
 * that could violate a whole-record invariant).
 */
export function validateUpdateCustomerInput(
  input: UpdateCustomerInput,
  existing: { phone: string | null; email: string | null }
): CustomerFieldErrors {
  const errors: CustomerFieldErrors = {};

  if (input.name !== undefined && !input.name.trim()) {
    errors.name = "Name is required.";
  }

  const phone = input.phone !== undefined ? input.phone?.trim() : existing.phone;
  const email = input.email !== undefined ? input.email?.trim() : existing.email;

  if (input.phone !== undefined && input.phone && input.phone.trim()) {
    const phoneError = validatePhoneFormat(input.phone);
    if (phoneError) errors.phone = phoneError;
  }
  if (input.email !== undefined && input.email && input.email.trim()) {
    const emailError = validateEmailFormat(input.email);
    if (emailError) errors.email = emailError;
  }

  if (!phone && !email) {
    errors.phone = "Provide at least a phone number or an email address.";
  }

  return errors;
}

import { isManualActivityType } from "./activity";
import type { CreateManualActivityInput } from "./activity-input";
import type { ActivityFieldErrors } from "./errors";

const MAX_CONTENT_LENGTH = 2000;

/**
 * Runtime validation for the client-facing manual-entry path — the
 * mission explicitly requires this not be TypeScript-union-only
 * ("Activity types must be runtime validated on server boundaries").
 */
export function validateCreateManualActivityInput(
  input: CreateManualActivityInput
): ActivityFieldErrors {
  const errors: ActivityFieldErrors = {};

  if (!isManualActivityType(input.type)) {
    errors.type = "Choose a valid activity type.";
  }

  const content = input.content.trim();
  if (!content) {
    errors.content = "Content is required.";
  } else if (content.length > MAX_CONTENT_LENGTH) {
    errors.content = `Content must be ${MAX_CONTENT_LENGTH} characters or fewer.`;
  }

  if (!input.customerId) {
    errors.customerId = "A customer is required.";
  }

  return errors;
}

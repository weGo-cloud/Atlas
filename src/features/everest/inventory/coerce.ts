import type { FieldSpec } from "../domain/inventory-types";

/**
 * Turns the model's raw `fields` object into clean, typed values for
 * the vertical's own validators. Unknown keys are rejected (the model
 * cannot smuggle in `businessId`, `id`, `addedAt` or anything else the
 * vertical does not expose), strings are trimmed, integers must be real
 * whole numbers, and enum fields must match exactly.
 */
export function coerceFields(
  specs: readonly FieldSpec[],
  raw: Record<string, unknown>,
  options: { partial: boolean }
): { ok: true; fields: Record<string, string | number | null> } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const fields: Record<string, string | number | null> = {};
  const known = new Map(specs.map((spec) => [spec.name, spec]));

  for (const key of Object.keys(raw)) {
    if (!known.has(key)) errors[key] = `"${key}" is not a field that can be set.`;
  }

  for (const spec of specs) {
    if (!(spec.name in raw)) continue;
    const value = raw[spec.name];
    if (value === null || value === undefined) {
      if (spec.requiredOnCreate && !options.partial) errors[spec.name] = `${spec.label} is required.`;
      else if (spec.requiredOnCreate) errors[spec.name] = `${spec.label} cannot be cleared.`;
      else fields[spec.name] = null;
      continue;
    }
    if (spec.type === "integer") {
      const numeric = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
      if (!Number.isInteger(numeric)) {
        errors[spec.name] = `${spec.label} must be a whole number.`;
        continue;
      }
      fields[spec.name] = numeric;
      continue;
    }
    if (typeof value !== "string") {
      errors[spec.name] = `${spec.label} must be text.`;
      continue;
    }
    const trimmed = value.trim();
    if (spec.enum && !spec.enum.includes(trimmed)) {
      errors[spec.name] = `${spec.label} must be one of: ${spec.enum.join(", ")}.`;
      continue;
    }
    fields[spec.name] = trimmed;
  }

  if (!options.partial) {
    for (const spec of specs) {
      if (spec.requiredOnCreate && !(spec.name in fields) && !(spec.name in errors)) {
        errors[spec.name] = `${spec.label} is required.`;
      }
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, fields };
}

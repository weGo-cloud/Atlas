"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VehicleFormField as FormField } from "@/features/inventory/components/vehicle-form-field";
import {
  FURNITURE_CATEGORIES,
  FURNITURE_CATEGORY_LABEL,
  FURNITURE_CONDITIONS,
  FURNITURE_CONDITION_LABEL,
  FURNITURE_STATUSES,
  FURNITURE_STATUS_LABEL,
  type FurnitureCategory,
  type FurnitureCondition,
  type FurnitureProduct,
  type FurnitureStatus,
} from "../domain/furniture-product";
import type { CreateFurnitureProductInput } from "../domain/furniture-product-input";
import type { FurnitureFieldErrors } from "../domain/errors";
import { createFurnitureProductAction, updateFurnitureProductAction } from "../actions/furniture-product-actions";

/**
 * Mission 030 — mirrors VehicleForm's shape and submit/error-handling
 * pattern (client component, calls the server action directly, shows
 * field-level errors inline, redirects to the detail page on success)
 * applied to furniture's field set instead of a vehicle's. Reuses
 * `VehicleFormField` from the inventory feature — despite the name, it
 * has no vehicle-specific logic (see that file), so duplicating it
 * here would be exactly the "unnecessary duplication of core
 * concepts" Section 4 warns against.
 */
export function FurnitureProductForm({ product }: { product?: FurnitureProduct }) {
  const router = useRouter();
  const isEditing = Boolean(product);

  const [values, setValues] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    category: product?.category ?? ("sofas" as FurnitureCategory),
    price: product ? String(product.price) : "",
    currency: product?.currency ?? "KES",
    condition: product?.condition ?? ("new" as FurnitureCondition),
    status: product?.status ?? ("available" as FurnitureStatus),
    material: product?.material ?? "",
    color: product?.color ?? "",
    dimensions: product?.dimensions ?? "",
    sku: product?.sku ?? "",
  });
  const [errors, setErrors] = useState<FurnitureFieldErrors>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setTopLevelError(null);

    const input: CreateFurnitureProductInput = {
      name: values.name.trim(),
      description: values.description,
      category: values.category,
      price: Number(values.price),
      currency: values.currency.trim() || "KES",
      condition: values.condition,
      status: values.status,
      material: values.material.trim() || null,
      color: values.color.trim() || null,
      dimensions: values.dimensions.trim() || null,
      sku: values.sku.trim() || null,
    };

    const result = product
      ? await updateFurnitureProductAction(product.id, input)
      : await createFurnitureProductAction(input);

    setSubmitting(false);

    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      setTopLevelError(result.error.message);
      return;
    }

    router.push(`/app/inventory/${result.product.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {topLevelError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {topLevelError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField htmlFor="name" label="Name" error={errors.name} className="sm:col-span-2">
          <Input id="name" value={values.name} onChange={(e) => update("name", e.target.value)} required />
        </FormField>

        <FormField htmlFor="category" label="Category" error={errors.category}>
          <Select
            id="category"
            value={values.category}
            onChange={(e) => update("category", e.target.value as FurnitureCategory)}
          >
            {FURNITURE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {FURNITURE_CATEGORY_LABEL[category]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField htmlFor="condition" label="Condition" error={errors.condition}>
          <Select
            id="condition"
            value={values.condition}
            onChange={(e) => update("condition", e.target.value as FurnitureCondition)}
          >
            {FURNITURE_CONDITIONS.map((condition) => (
              <option key={condition} value={condition}>
                {FURNITURE_CONDITION_LABEL[condition]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField htmlFor="price" label="Price" error={errors.price}>
          <Input
            id="price"
            type="number"
            min={0}
            step="1"
            value={values.price}
            onChange={(e) => update("price", e.target.value)}
            required
          />
        </FormField>

        <FormField htmlFor="currency" label="Currency" error={errors.currency}>
          <Input id="currency" value={values.currency} onChange={(e) => update("currency", e.target.value)} required />
        </FormField>

        <FormField htmlFor="status" label="Availability" error={errors.status}>
          <Select id="status" value={values.status} onChange={(e) => update("status", e.target.value as FurnitureStatus)}>
            {FURNITURE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FURNITURE_STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField htmlFor="material" label="Material (optional)" error={errors.material}>
          <Input id="material" value={values.material} onChange={(e) => update("material", e.target.value)} />
        </FormField>

        <FormField htmlFor="color" label="Color (optional)" error={errors.color}>
          <Input id="color" value={values.color} onChange={(e) => update("color", e.target.value)} />
        </FormField>

        <FormField htmlFor="dimensions" label="Dimensions (optional)" error={errors.dimensions}>
          <Input
            id="dimensions"
            placeholder="e.g. 180cm x 90cm x 75cm"
            value={values.dimensions}
            onChange={(e) => update("dimensions", e.target.value)}
          />
        </FormField>

        <FormField htmlFor="sku" label="SKU (optional)" error={errors.sku}>
          <Input id="sku" value={values.sku} onChange={(e) => update("sku", e.target.value)} />
        </FormField>

        <FormField htmlFor="description" label="Description" error={errors.description} className="sm:col-span-2">
          <Textarea
            id="description"
            rows={5}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </FormField>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isEditing ? "Save changes" : "Add product"}
        </Button>
      </div>
    </form>
  );
}

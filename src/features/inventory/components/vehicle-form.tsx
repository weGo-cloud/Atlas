"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createVehicleAction, updateVehicleAction } from "../actions/vehicle-actions";
import { uploadVehiclePhotosAction } from "../actions/vehicle-photo-actions";
import type { Vehicle } from "../data/types";
import { VEHICLE_STATUSES, VEHICLE_STATUS_LABEL } from "../data/types";
import type { VehiclePhoto } from "../domain/vehicle-photo";
import {
  getInitialFormValues,
  validateVehicleForm,
  type VehicleFormErrors,
  type VehicleFormValues,
} from "../lib/vehicle-form-schema";
import { VehicleFormField } from "./vehicle-form-field";
import { VehiclePhotoManager } from "./vehicle-photo-manager";

type VehicleFormMode = "create" | "edit";

type SubmitState = "idle" | "submitting" | "success";

type VehicleFormProps = {
  mode: VehicleFormMode;
  vehicle?: Vehicle;
  /** Persisted photos, for edit mode — fetched server-side by the page. */
  photos?: VehiclePhoto[];
};

function VehicleForm({ mode, vehicle, photos }: VehicleFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<VehicleFormValues>(() =>
    getInitialFormValues(vehicle)
  );
  const [errors, setErrors] = useState<VehicleFormErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [stagedPhotoFiles, setStagedPhotoFiles] = useState<File[]>([]);

  const cancelHref =
    mode === "edit" && vehicle
      ? `/app/inventory/${vehicle.id}`
      : "/app/inventory";

  const updateField = <K extends keyof VehicleFormValues>(
    field: K,
    value: VehicleFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTopLevelError(null);

    const validationErrors = validateVehicleForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitState("submitting");

    // Real save, through the service/repository boundary — mock-backed
    // for now, but this is genuine persistence for the life of the
    // server process, not a UI-only simulation.
    const result =
      mode === "create"
        ? await createVehicleAction(values)
        : await updateVehicleAction(vehicle!.id, values);

    if (!result.ok) {
      setSubmitState("idle");
      if (result.error.fieldErrors) {
        setErrors(result.error.fieldErrors);
      }
      setTopLevelError(result.error.message);
      return;
    }

    // Photos are staged client-side until the vehicle exists (create
    // mode only — edit mode uploads immediately via VehiclePhotoManager).
    // The vehicle itself is already saved at this point regardless of
    // what happens next, so a photo failure here is surfaced as a
    // warning rather than blocking navigation to the new vehicle.
    let photoWarning: string | null = null;
    if (mode === "create" && stagedPhotoFiles.length > 0) {
      const formData = new FormData();
      stagedPhotoFiles.forEach((file) => formData.append("files", file));
      const uploadResult = await uploadVehiclePhotosAction(
        result.vehicle.id,
        formData
      );
      if (uploadResult.ok) {
        const failures = uploadResult.outcomes.filter((o) => !o.ok);
        if (failures.length > 0) {
          photoWarning = `Vehicle created, but ${failures.length} photo(s) failed to upload. You can add them from the edit page.`;
        }
      } else {
        photoWarning =
          "Vehicle created, but photos failed to upload. You can add them from the edit page.";
      }
    }

    if (photoWarning) setTopLevelError(photoWarning);
    setSubmitState("success");
    const destination = `/app/inventory/${result.vehicle.id}`;

    // Give the person a moment to read the photo-upload warning, if
    // any, before navigating away — the plain success case keeps the
    // original short delay.
    setTimeout(
      () => {
        router.push(destination);
        router.refresh();
      },
      photoWarning ? 2500 : 700
    );
  };

  const isSubmitting = submitState !== "idle";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {submitState === "success" && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {mode === "create"
            ? "Vehicle created."
            : "Changes saved."}
        </div>
      )}

      {topLevelError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {topLevelError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 pt-0 sm:grid-cols-2">
          <VehicleFormField htmlFor="make" label="Make" error={errors.make}>
            <Input
              id="make"
              value={values.make}
              onChange={(e) => updateField("make", e.target.value)}
              placeholder="Toyota"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.make)}
            />
          </VehicleFormField>

          <VehicleFormField htmlFor="model" label="Model" error={errors.model}>
            <Input
              id="model"
              value={values.model}
              onChange={(e) => updateField("model", e.target.value)}
              placeholder="Harrier"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.model)}
            />
          </VehicleFormField>

          <VehicleFormField htmlFor="year" label="Year" error={errors.year}>
            <Input
              id="year"
              inputMode="numeric"
              value={values.year}
              onChange={(e) => updateField("year", e.target.value)}
              placeholder="2022"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.year)}
            />
          </VehicleFormField>

          <VehicleFormField
            htmlFor="stockId"
            label="Stock ID"
            error={errors.stockId}
          >
            <Input
              id="stockId"
              value={values.stockId}
              onChange={(e) => updateField("stockId", e.target.value)}
              placeholder="ATL-1042"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.stockId)}
            />
          </VehicleFormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; Status</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 pt-0 sm:grid-cols-3">
          <VehicleFormField htmlFor="price" label="Price (KSh)" error={errors.price}>
            <Input
              id="price"
              inputMode="numeric"
              value={values.price}
              onChange={(e) => updateField("price", e.target.value)}
              placeholder="6250000"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.price)}
            />
          </VehicleFormField>

          <VehicleFormField
            htmlFor="mileage"
            label="Mileage (km)"
            error={errors.mileage}
          >
            <Input
              id="mileage"
              inputMode="numeric"
              value={values.mileage}
              onChange={(e) => updateField("mileage", e.target.value)}
              placeholder="18400"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.mileage)}
            />
          </VehicleFormField>

          <VehicleFormField htmlFor="status" label="Status">
            <Select
              id="status"
              value={values.status}
              onChange={(e) =>
                updateField(
                  "status",
                  e.target.value as VehicleFormValues["status"]
                )
              }
              disabled={isSubmitting}
            >
              {VEHICLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {VEHICLE_STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </VehicleFormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <VehicleFormField htmlFor="description" label="Listing description">
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Describe the vehicle's condition, history, and standout features..."
              rows={5}
              disabled={isSubmitting}
            />
          </VehicleFormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vehicle Photos</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {mode === "create" ? (
            <VehiclePhotoManager
              mode="create"
              onStagedFilesChange={setStagedPhotoFiles}
            />
          ) : (
            <VehiclePhotoManager
              mode="edit"
              vehicleId={vehicle!.id}
              initialPhotos={photos ?? []}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        {isSubmitting ? (
          <Button type="button" variant="outline" disabled>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="outline" asChild>
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting} className="gap-1.5">
          {submitState === "submitting" && (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {mode === "create" ? "Create Vehicle" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

export { VehicleForm };

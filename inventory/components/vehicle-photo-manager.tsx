"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
} from "lucide-react";

import {
  deleteVehiclePhotoAction,
  reorderVehiclePhotosAction,
  setPrimaryVehiclePhotoAction,
  uploadVehiclePhotosAction,
} from "../actions/vehicle-photo-actions";
import type { VehiclePhoto } from "../domain/vehicle-photo";

const ACCEPTED_INPUT_TYPES = "image/jpeg,image/png,image/webp";
const MAX_PHOTOS_PER_VEHICLE = 10;

type StagedPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type VehiclePhotoManagerProps =
  | {
      /** No vehicle exists yet — files are staged and handed to the parent form, which uploads them after the vehicle is created. */
      mode: "create";
      onStagedFilesChange: (files: File[]) => void;
    }
  | {
      /** Vehicle already exists — every action below persists immediately. */
      mode: "edit";
      vehicleId: string;
      initialPhotos: VehiclePhoto[];
    };

function VehiclePhotoManager(props: VehiclePhotoManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // --- create mode: local-only staging -------------------------------
  const [staged, setStaged] = useState<StagedPhoto[]>([]);

  useEffect(() => {
    return () => {
      staged.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- edit mode: persisted photos + immediate server actions --------
  const [photos, setPhotos] = useState<VehiclePhoto[]>(
    props.mode === "edit" ? props.initialPhotos : []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoCount = props.mode === "create" ? staged.length : photos.length;
  const atCapacity = photoCount >= MAX_PHOTOS_PER_VEHICLE;

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setError(null);

    if (props.mode === "create") {
      const remainingSlots = MAX_PHOTOS_PER_VEHICLE - staged.length;
      const accepted = files.slice(0, Math.max(0, remainingSlots));
      const newStaged: StagedPhoto[] = accepted.map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      const next = [...staged, ...newStaged];
      setStaged(next);
      props.onStagedFilesChange(next.map((item) => item.file));
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    const result = await uploadVehiclePhotosAction(props.vehicleId, formData);
    setIsUploading(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setPhotos(result.photos);
    const failures = result.outcomes.filter((outcome) => !outcome.ok);
    if (failures.length > 0) {
      setError(
        failures
          .map((failure) => `${failure.fileName}: ${failure.error}`)
          .join(" ")
      );
    }
  };

  const handleRemoveStaged = (id: string) => {
    setStaged((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((item) => item.id !== id);
      if (props.mode === "create") {
        props.onStagedFilesChange(next.map((item) => item.file));
      }
      return next;
    });
  };

  const handleDelete = async (photoId: string) => {
    if (props.mode !== "edit") return;
    setBusyPhotoId(photoId);
    setError(null);

    const result = await deleteVehiclePhotoAction(props.vehicleId, photoId);
    setBusyPhotoId(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPhotos(result.photos);
  };

  const handleSetPrimary = async (photoId: string) => {
    if (props.mode !== "edit") return;
    setBusyPhotoId(photoId);
    setError(null);

    const result = await setPrimaryVehiclePhotoAction(props.vehicleId, photoId);
    setBusyPhotoId(null);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPhotos(result.photos);
  };

  const handleMove = async (photoId: string, direction: -1 | 1) => {
    if (props.mode !== "edit") return;
    const index = photos.findIndex((photo) => photo.id === photoId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= photos.length) return;

    const reordered = [...photos];
    [reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ];
    setPhotos(reordered);
    setBusyPhotoId(photoId);
    setError(null);

    const result = await reorderVehiclePhotosAction(
      props.vehicleId,
      reordered.map((photo) => photo.id)
    );
    setBusyPhotoId(null);

    if (!result.ok) {
      setError(result.error.message);
      setPhotos(photos); // revert on failure
      return;
    }
    setPhotos(result.photos);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_INPUT_TYPES}
        multiple
        className="hidden"
        onChange={(event) => {
          void handleFilesSelected(event.target.files);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={atCapacity || isUploading}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-2/40 px-6 py-10 text-center transition-colors hover:bg-surface-2/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-subtle-foreground" />
        ) : (
          <ImagePlus className="h-6 w-6 text-subtle-foreground" strokeWidth={1.5} />
        )}
        <span className="text-sm font-medium text-foreground">
          {atCapacity
            ? `Maximum of ${MAX_PHOTOS_PER_VEHICLE} photos reached`
            : "Click to select photos"}
        </span>
        <span className="text-xs text-muted-foreground">
          JPEG, PNG, or WEBP · up to 5MB each
          {props.mode === "create" &&
            " — uploaded once the vehicle is created"}
        </span>
      </button>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {props.mode === "create" && staged.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {staged.map((item, index) => (
            <div
              key={item.id}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previewUrl}
                alt={item.file.name}
                className="h-full w-full object-cover"
              />
              {index === 0 && (
                <span className="absolute left-1 top-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  Cover
                </span>
              )}
              <button
                type="button"
                onClick={() => handleRemoveStaged(item.id)}
                aria-label={`Remove ${item.file.name}`}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity hover:bg-background focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {props.mode === "edit" && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.map((photo, index) => {
            const isBusy = busyPhotoId === photo.id;
            return (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-md border border-border bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt=""
                  className="h-full w-full object-cover"
                />

                {isBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                    <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                  </div>
                )}

                {photo.isPrimary && (
                  <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Cover
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-background/80 px-1 py-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => handleMove(photo.id, -1)}
                    disabled={index === 0 || isBusy}
                    aria-label="Move photo earlier"
                    className="flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(photo.id)}
                    disabled={photo.isPrimary || isBusy}
                    aria-label="Set as cover photo"
                    className="flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(photo.id)}
                    disabled={isBusy}
                    aria-label="Remove photo"
                    className="flex h-6 w-6 items-center justify-center rounded text-destructive hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMove(photo.id, 1)}
                    disabled={index === photos.length - 1 || isBusy}
                    aria-label="Move photo later"
                    className="flex h-6 w-6 items-center justify-center rounded text-foreground hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { VehiclePhotoManager };

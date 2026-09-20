"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteFurniturePhotoAction,
  setPrimaryFurniturePhotoAction,
  uploadFurniturePhotosAction,
} from "../actions/furniture-photo-actions";
import { MAX_PHOTOS_PER_PRODUCT, type FurnitureProductPhoto } from "../domain/furniture-product-photo";

const ACCEPTED_INPUT_TYPES = "image/jpeg,image/png,image/webp";

/**
 * Mission 030 — a deliberately edit-only simplification of
 * VehiclePhotoManager (no "create" staging mode: a new furniture
 * product is created first via FurnitureProductForm, then photos are
 * added here on the resulting detail page). "Do not add fields
 * merely because they sound useful" applies equally to UI modes —
 * the staging-mode complexity in the vehicle version exists to avoid
 * an extra round trip on vehicle creation, which is a nice-to-have,
 * not a requirement Section 9 actually asks for ("furniture should
 * support multiple product photographs" — it does, just via create
 * then upload rather than one atomic step).
 */
export function FurniturePhotoManager({
  productId,
  initialPhotos,
}: {
  productId: string;
  initialPhotos: FurnitureProductPhoto[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<FurnitureProductPhoto[]>(initialPhotos);
  const [isUploading, setIsUploading] = useState(false);
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const atCapacity = photos.length >= MAX_PHOTOS_PER_PRODUCT;

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setIsUploading(true);

    const formData = new FormData();
    Array.from(fileList).forEach((file) => formData.append("files", file));

    const result = await uploadFurniturePhotosAction(productId, formData);
    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = "";

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPhotos(result.photos);
    const failed = result.outcomes.filter((outcome) => !outcome.ok);
    if (failed.length > 0) {
      setError(failed.map((outcome) => `${outcome.fileName}: ${outcome.error}`).join(" "));
    }
  }

  async function handleDelete(photoId: string) {
    setBusyPhotoId(photoId);
    setError(null);
    const result = await deleteFurniturePhotoAction(productId, photoId);
    setBusyPhotoId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPhotos(result.photos);
  }

  async function handleSetPrimary(photoId: string) {
    setBusyPhotoId(photoId);
    setError(null);
    const result = await setPrimaryFurniturePhotoAction(productId, photoId);
    setBusyPhotoId(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPhotos(result.photos);
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="group relative overflow-hidden rounded-md border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element -- served from our own route handler. */}
              <img src={photo.url} alt="" className="aspect-square w-full object-cover" />
              {photo.isPrimary ? (
                <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Primary
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!photo.isPrimary ? (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(photo.id)}
                    disabled={busyPhotoId === photo.id}
                    aria-label="Set as primary photo"
                    className="rounded p-1 text-white hover:bg-white/20"
                  >
                    {busyPhotoId === photo.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleDelete(photo.id)}
                  disabled={busyPhotoId === photo.id}
                  aria-label="Delete photo"
                  className="rounded p-1 text-white hover:bg-white/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_INPUT_TYPES}
          multiple
          className="sr-only"
          id="furniture-photo-upload"
          onChange={(e) => handleFilesSelected(e.target.files)}
          disabled={atCapacity || isUploading}
        />
        <Button asChild variant="outline" disabled={atCapacity || isUploading}>
          <label htmlFor="furniture-photo-upload" className="cursor-pointer">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {atCapacity ? `Maximum ${MAX_PHOTOS_PER_PRODUCT} photos` : "Add photos"}
          </label>
        </Button>
      </div>
    </div>
  );
}

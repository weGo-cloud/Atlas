"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

import type { VehiclePhoto } from "../domain/vehicle-photo";

type VehicleGalleryProps = {
  photos: VehiclePhoto[];
  vehicleLabel: string;
};

function VehicleGallery({ photos, vehicleLabel }: VehicleGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = photos[activeIndex];

  if (photos.length === 0) {
    return (
      <div
        className="flex aspect-[4/3] items-center justify-center rounded-lg border border-border bg-surface-2 transition-colors sm:aspect-[16/10]"
        role="img"
        aria-label="Vehicle photo not yet available"
      >
        <div className="flex flex-col items-center gap-2 text-subtle-foreground">
          <ImageIcon className="h-9 w-9" strokeWidth={1.5} />
          <span className="text-xs font-medium">No photos yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border bg-surface-2 transition-colors sm:aspect-[16/10]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={active.url}
          alt={vehicleLabel}
          className="h-full w-full object-cover"
        />
      </div>

      {photos.length > 1 && (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-pressed={index === activeIndex}
              aria-label={`Show photo ${index + 1}`}
              className={`aspect-square overflow-hidden rounded-md border bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                index === activeIndex
                  ? "border-primary"
                  : "border-border hover:border-border-strong"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { VehicleGallery };

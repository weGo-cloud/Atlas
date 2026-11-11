import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { VehicleForm } from "@/features/inventory/components/vehicle-form";
import { getVehiclePhotoService, getVehicleService } from "@/features/inventory/service";
import { FurnitureProductForm } from "@/features/furniture/components/furniture-product-form";
import { getFurnitureProductService } from "@/features/furniture/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

type EditVehiclePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: EditVehiclePageProps): Promise<Metadata> {
  const { business } = await requireCurrentSession();
  const { id } = await params;

  if (business.vertical === "furniture") {
    const result = await getFurnitureProductService(business.id).getProduct(id);
    return result.ok ? { title: `Edit ${result.data.name} · Atlas` } : { title: "Product not found · Atlas" };
  }

  const result = await getVehicleService(business.id).getVehicle(id);
  if (!result.ok) {
    return { title: "Vehicle not found · Atlas" };
  }
  return { title: `Edit ${result.data.make} ${result.data.model} · Atlas` };
}

export default async function EditVehiclePage({
  params,
}: EditVehiclePageProps) {
  const { business } = await requireCurrentSession();
  const { id } = await params;

  if (business.vertical === "furniture") {
    const result = await getFurnitureProductService(business.id).getProduct(id);
    if (!result.ok) notFound();
    const product = result.data;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Link
            href={`/app/inventory/${product.id}`}
            className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {product.name}
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Edit Product</h1>
            <p className="mt-1 text-sm text-muted-foreground">{product.name}</p>
          </div>
        </div>

        <FurnitureProductForm product={product} />
      </div>
    );
  }

  const vehicleService = getVehicleService(business.id);
  const vehiclePhotoService = getVehiclePhotoService(business.id);

  const result = await vehicleService.getVehicle(id);

  if (!result.ok) {
    notFound();
  }

  const vehicle = result.data;
  const photosResult = await vehiclePhotoService.listPhotos(vehicle.id);
  const photos = photosResult.ok ? photosResult.data : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href={`/app/inventory/${vehicle.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {vehicle.make} {vehicle.model}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Edit Vehicle
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {vehicle.make} {vehicle.model} · Stock ID: {vehicle.stockId}
          </p>
        </div>
      </div>

      <VehicleForm mode="edit" vehicle={vehicle} photos={photos} />
    </div>
  );
}

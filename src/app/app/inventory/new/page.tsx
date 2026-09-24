import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { VehicleForm } from "@/features/inventory/components/vehicle-form";
import { FurnitureProductForm } from "@/features/furniture/components/furniture-product-form";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Add Item · Atlas" };

export default async function NewInventoryItemPage() {
  const { business } = await requireCurrentSession();
  const isFurniture = business.vertical === "furniture";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href="/app/inventory"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isFurniture ? "Add Product" : "Add Vehicle"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isFurniture ? "Add a new furniture product to your inventory." : "Add a new vehicle to your inventory."}
          </p>
        </div>
      </div>

      {isFurniture ? <FurnitureProductForm /> : <VehicleForm mode="create" />}
    </div>
  );
}

import type { FurnitureCategory, FurnitureCondition, FurnitureStatus } from "./furniture-product";

export type CreateFurnitureProductInput = {
  name: string;
  description: string;
  category: FurnitureCategory;
  price: number;
  currency: string;
  condition: FurnitureCondition;
  status: FurnitureStatus;
  material: string | null;
  color: string | null;
  dimensions: string | null;
  sku: string | null;
};

export type UpdateFurnitureProductInput = Partial<CreateFurnitureProductInput>;

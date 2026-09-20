import { Badge } from "@/components/ui/badge";
import type { DecisionCategory } from "../domain/category";

const CATEGORY_LABEL: Record<DecisionCategory, string> = {
  LEAD_PRIORITIZATION: "Lead prioritization",
  FOLLOW_UP: "Follow-up",
  INVENTORY_REVIEW: "Inventory",
  SALES_REVIEW: "Sales",
  DATA_INTEGRITY: "Data integrity",
  PIPELINE_REVIEW: "Pipeline",
};

export function CategoryBadge({ category }: { category: DecisionCategory }) {
  return <Badge variant="default">{CATEGORY_LABEL[category]}</Badge>;
}

import { Flame, ArrowUpCircle, CircleDot, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Priority } from "../domain/priority";

const PRIORITY_CONFIG: Record<Priority, { label: string; variant: "destructive" | "warning" | "primary" | "default"; icon: typeof Circle }> = {
  URGENT: { label: "Urgent", variant: "destructive", icon: Flame },
  HIGH: { label: "High", variant: "warning", icon: ArrowUpCircle },
  MEDIUM: { label: "Medium", variant: "primary", icon: CircleDot },
  LOW: { label: "Low", variant: "default", icon: Circle },
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const config = PRIORITY_CONFIG[priority];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

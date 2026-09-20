import { AlertTriangle, AlertCircle, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { SignalSeverity } from "../domain/signal";

const SEVERITY_CONFIG: Record<SignalSeverity, { label: string; variant: "primary" | "warning" | "destructive"; icon: typeof Info }> = {
  INFO: { label: "Info", variant: "primary", icon: Info },
  WARNING: { label: "Warning", variant: "warning", icon: AlertTriangle },
  CRITICAL: { label: "Critical", variant: "destructive", icon: AlertCircle },
};

export function SeverityBadge({ severity }: { severity: SignalSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

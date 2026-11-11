import type { LucideIcon } from "lucide-react";

import { StatCard } from "@/components/shared/stat-card";

/**
 * The shared StatCard, minus the delta/trend arrow — period-over-period
 * comparison isn't implemented, so there's no honest delta to show. A
 * future mission can add it once a real prior-period comparison exists;
 * showing a fabricated one would misrepresent real change.
 */
export function AnalyticsMetricCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  icon: LucideIcon;
}) {
  return <StatCard label={label} value={value} hint={sublabel} icon={icon} />;
}

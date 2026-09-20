"use client";

import { DashboardErrorState } from "@/features/dashboard/components/dashboard-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <DashboardErrorState onRetry={reset} />;
}

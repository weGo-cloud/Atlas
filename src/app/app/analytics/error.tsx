"use client";

import { AnalyticsErrorState } from "@/features/analytics/components/analytics-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <AnalyticsErrorState onRetry={reset} />;
}

"use client";

import { SalesErrorState } from "@/features/sales/components/sales-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <SalesErrorState onRetry={reset} />;
}

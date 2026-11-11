"use client";

import { DealsErrorState } from "@/features/deals/components/deals-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <DealsErrorState onRetry={reset} />;
}

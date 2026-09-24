"use client";

import { IntelligenceErrorState } from "@/features/intelligence/components/intelligence-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <IntelligenceErrorState onRetry={reset} />;
}

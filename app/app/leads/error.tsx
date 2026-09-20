"use client";

import { LeadsErrorState } from "@/features/leads/components/leads-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <LeadsErrorState onRetry={reset} />;
}

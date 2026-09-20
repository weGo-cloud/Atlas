"use client";

import { CustomersErrorState } from "@/features/customers/components/customers-error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <CustomersErrorState onRetry={reset} />;
}

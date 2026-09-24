import Link from "next/link";
import { UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";

function CustomerNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-subtle-foreground">
        <UserRound className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Customer not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The customer you&apos;re looking for doesn&apos;t exist or may have
          been removed.
        </p>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link href="/app/customers">Back to Customers</Link>
      </Button>
    </div>
  );
}

export { CustomerNotFound };

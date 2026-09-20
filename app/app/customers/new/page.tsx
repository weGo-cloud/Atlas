import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CustomerForm } from "@/features/customers/components/customer-form";

export const metadata = { title: "Add Customer · Atlas" };

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href="/app/customers"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Customers
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Add Customer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a new customer contact.
          </p>
        </div>
      </div>

      <CustomerForm mode="create" />
    </div>
  );
}

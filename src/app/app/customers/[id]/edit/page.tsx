import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CustomerForm } from "@/features/customers/components/customer-form";
import { getCustomerService } from "@/features/customers/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Edit Customer · Atlas" };

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({ params }: EditCustomerPageProps) {
  const { business } = await requireCurrentSession();
  const customerService = getCustomerService(business.id);

  const { id } = await params;

  const result = await customerService.getCustomer(id);
  if (!result.ok) notFound();
  const customer = result.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href={`/app/customers/${customer.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {customer.name}
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Edit Customer
          </h1>
        </div>
      </div>

      <CustomerForm mode="edit" customer={customer} />
    </div>
  );
}

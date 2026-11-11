import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CustomerTable } from "@/features/customers/components/customer-table";
import { CustomerToolbar } from "@/features/customers/components/customer-toolbar";
import { getCustomerService } from "@/features/customers/service";
import { requireCurrentSession } from "@/features/auth/lib/current-session";

export const metadata = { title: "Customers · Atlas" };

type CustomersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { business } = await requireCurrentSession();
  const customerService = getCustomerService(business.id);

  const resolvedSearchParams = await searchParams;
  const search = firstValue(resolvedSearchParams.q) ?? "";
  const pageParam = firstValue(resolvedSearchParams.page);
  const page = pageParam && Number.isFinite(Number(pageParam)) ? Number(pageParam) : 1;

  const result = await customerService.listCustomers({
    search: search || undefined,
    page,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Customers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A single record for every customer relationship.
          </p>
        </div>
        <Button asChild className="gap-1.5 self-start">
          <Link href="/app/customers/new">
            <Plus className="h-4 w-4" />
            Add customer
          </Link>
        </Button>
      </div>

      <CustomerToolbar initialSearch={search} />

      <CustomerTable result={result} search={search} />
    </div>
  );
}

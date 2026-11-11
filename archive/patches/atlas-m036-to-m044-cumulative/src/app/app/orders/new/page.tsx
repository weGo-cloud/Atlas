import Link from "next/link";

import { requireCurrentSession } from "@/features/auth/lib/current-session";
import { getCustomerService } from "@/features/customers/service";
import { getFurnitureProductService } from "@/features/furniture/service";
import { NewOrderForm } from "@/features/orders/components/new-order-form";

export const metadata = { title: "New order · Atlas" };

export default async function NewOrderPage() {
  const { business } = await requireCurrentSession();
  if (business.vertical !== "furniture") return <p className="text-sm text-muted-foreground">Orders are for furniture businesses. <Link href="/app/deals" className="underline">Go to Deals</Link>.</p>;
  const [customers, products] = await Promise.all([
    getCustomerService(business.id).listCustomers({ page: 1, pageSize: 100 }),
    getFurnitureProductService(business.id).listProductsPaged({ status: "available", page: 1, pageSize: 100 }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">New order</h1>
        <p className="text-sm text-muted-foreground">Create a draft, then confirm it to reserve the stock. Prices are taken from your inventory when you create the order.</p>
      </div>
      <NewOrderForm
        customers={customers.items.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null }))}
        products={products.items.map((p) => ({ id: p.id, name: p.name, price: p.price, stock: p.stockQuantity }))}
      />
    </div>
  );
}

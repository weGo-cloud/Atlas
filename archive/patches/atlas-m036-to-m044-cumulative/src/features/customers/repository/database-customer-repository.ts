import { and, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { customers, type CustomerRow } from "@/lib/db/schema";
import type { Customer } from "../domain/customer";
import type { CreateCustomerInput, UpdateCustomerInput } from "../domain/customer-input";
import {
  normalizePagination,
  type CustomerQuery,
  type PaginatedResult,
} from "../domain/customer-query";
import type { CustomerRepository } from "./customer-repository";

/** Mission 012: scoped to a single business at construction time — see database-vehicle-repository.ts for the full rationale, which applies identically here. */
export class DatabaseCustomerRepository implements CustomerRepository {
  constructor(private readonly businessId: string) {}

  private get ownedByBusiness(): SQL {
    return eq(customers.businessId, this.businessId);
  }

  async getCustomers(query: CustomerQuery): Promise<PaginatedResult<Customer>> {
    const { page, pageSize } = normalizePagination(query);
    const offset = (page - 1) * pageSize;

    const searchCondition =
      query.search && query.search.trim() !== ""
        ? (() => {
            // SQLite's LIKE is case-insensitive for ASCII by default.
            const term = `%${query.search!.trim()}%`;
            return or(
              like(customers.name, term),
              like(customers.phone, term),
              like(customers.email, term)
            );
          })()
        : undefined;

    const whereClause = searchCondition
      ? and(this.ownedByBusiness, searchCondition)
      : this.ownedByBusiness;

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(customers)
        .where(whereClause)
        .orderBy(sql`${customers.createdAt} desc`)
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(customers).where(whereClause),
    ]);

    const total = countRows[0]?.count ?? 0;

    return {
      items: rows.map(toCustomer),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    const rows = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), this.ownedByBusiness))
      .limit(1);
    return rows[0] ? toCustomer(rows[0]) : null;
  }

  async getCustomersByIds(ids: string[]): Promise<Customer[]> {
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(customers)
      .where(and(inArray(customers.id, ids), this.ownedByBusiness));
    return rows.map(toCustomer);
  }

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const now = new Date().toISOString();
    const id = generateId();

    await db.insert(customers).values({
      id,
      businessId: this.businessId,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      notes: input.notes ?? "",
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.getCustomerById(id);
    if (!created) {
      throw new Error("Failed to read back newly created customer.");
    }
    return created;
  }

  async updateCustomer(
    id: string,
    input: UpdateCustomerInput
  ): Promise<Customer | null> {
    const existing = await this.getCustomerById(id);
    if (!existing) return null;

    await db
      .update(customers)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(and(eq(customers.id, id), this.ownedByBusiness));

    return this.getCustomerById(id);
  }

  async countCustomers(): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(this.ownedByBusiness);
    return rows[0]?.count ?? 0;
  }
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    businessId: row.businessId as string,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `cust_${Date.now().toString(36)}${counter.toString(36)}`;
}

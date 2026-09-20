"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  VEHICLE_STATUSES,
  VEHICLE_STATUS_LABEL,
  type VehicleStatus,
} from "../data/types";
import {
  VEHICLE_SORT_LABEL,
  VEHICLE_SORT_OPTIONS,
  type VehicleQuery,
} from "../domain/vehicle-query";
import {
  buildInventoryQueryString,
  hasActiveInventoryFilters,
} from "../lib/inventory-query-params";

type StatusOption = VehicleStatus | "all";

const STATUS_OPTIONS: StatusOption[] = ["all", ...VEHICLE_STATUSES];

function statusLabel(status: StatusOption): string {
  return status === "all" ? "All" : VEHICLE_STATUS_LABEL[status];
}

type InventoryToolbarProps = {
  query: VehicleQuery;
  makes: string[];
};

function InventoryToolbar({ query, makes }: InventoryToolbarProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(query.search ?? "");
  // React's recommended "adjust state during render" pattern instead
  // of an effect — this fires synchronously during render when the
  // URL's search param changes (e.g. after "Clear all"), keeping the
  // input in sync without an effect-driven setState.
  const [trackedSearch, setTrackedSearch] = useState(query.search ?? "");
  if (trackedSearch !== (query.search ?? "")) {
    setTrackedSearch(query.search ?? "");
    setSearchValue(query.search ?? "");
  }
  const [rangeOpen, setRangeOpen] = useState(false);
  const [minPrice, setMinPrice] = useState(query.minPrice?.toString() ?? "");
  const [maxPrice, setMaxPrice] = useState(query.maxPrice?.toString() ?? "");
  const [minYear, setMinYear] = useState(query.minYear?.toString() ?? "");
  const [maxYear, setMaxYear] = useState(query.maxYear?.toString() ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = (overrides: Partial<VehicleQuery>) => {
    const qs = buildInventoryQueryString(query, { ...overrides, page: 1 });
    router.push(`/app/inventory${qs}`);
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ search: value.trim() === "" ? undefined : value });
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const applyRange = () => {
    navigate({
      minPrice: minPrice.trim() === "" ? undefined : Number(minPrice),
      maxPrice: maxPrice.trim() === "" ? undefined : Number(maxPrice),
      minYear: minYear.trim() === "" ? undefined : Number(minYear),
      maxYear: maxYear.trim() === "" ? undefined : Number(maxYear),
    });
  };

  const clearRange = () => {
    setMinPrice("");
    setMaxPrice("");
    setMinYear("");
    setMaxYear("");
    navigate({
      minPrice: undefined,
      maxPrice: undefined,
      minYear: undefined,
      maxYear: undefined,
    });
  };

  const rangeActive =
    query.minPrice != null ||
    query.maxPrice != null ||
    query.minYear != null ||
    query.maxYear != null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Search by stock ID, make, or model..."
          aria-label="Search vehicles"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Filter by status"
          className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-surface p-1"
        >
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={(query.status ?? "all") === status}
              onClick={() =>
                navigate({ status: status === "all" ? undefined : status })
              }
              className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                (query.status ?? "all") === status
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor="inventory-make-filter">
          Filter by make
        </label>
        <select
          id="inventory-make-filter"
          value={query.make ?? "all"}
          onChange={(event) =>
            navigate({
              make: event.target.value === "all" ? undefined : event.target.value,
            })
          }
          className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="all">All makes</option>
          {makes.map((make) => (
            <option key={make} value={make}>
              {make}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="inventory-sort">
          Sort
        </label>
        <select
          id="inventory-sort"
          value={query.sort}
          onChange={(event) =>
            navigate({
              sort: event.target.value as VehicleQuery["sort"],
            })
          }
          className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {VEHICLE_SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {VEHICLE_SORT_LABEL[option]}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant={rangeActive ? "default" : "outline"}
          size="sm"
          onClick={() => setRangeOpen((prev) => !prev)}
          className="gap-1.5"
          aria-expanded={rangeOpen}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Price &amp; year
        </Button>

        {hasActiveInventoryFilters(query) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push("/app/inventory")}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>

      {rangeOpen && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-2/40 p-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="min-price"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Min price (KSh)
            </label>
            <Input
              id="min-price"
              type="number"
              inputMode="numeric"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              className="h-8 w-28 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="max-price"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Max price (KSh)
            </label>
            <Input
              id="max-price"
              type="number"
              inputMode="numeric"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              className="h-8 w-28 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="min-year"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Min year
            </label>
            <Input
              id="min-year"
              type="number"
              inputMode="numeric"
              value={minYear}
              onChange={(event) => setMinYear(event.target.value)}
              className="h-8 w-20 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="max-year"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Max year
            </label>
            <Input
              id="max-year"
              type="number"
              inputMode="numeric"
              value={maxYear}
              onChange={(event) => setMaxYear(event.target.value)}
              className="h-8 w-20 text-xs"
            />
          </div>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" onClick={applyRange}>
              Apply
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearRange}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { InventoryToolbar };
export type { StatusOption };

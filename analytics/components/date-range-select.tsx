"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABEL, type DateRangePreset } from "../domain/date-range";
import { buildAnalyticsQueryString } from "../lib/analytics-query-params";

/** Mirrors CustomerToolbar's router.push pattern — the range lives in the URL so it survives a refresh/share and drives the server component directly (no client-side data fetching). */
export function DateRangeSelect({ preset }: { preset: DateRangePreset }) {
  const router = useRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextPreset = event.target.value as DateRangePreset;
    if (nextPreset === "custom") {
      // Custom bounds need explicit from/to inputs elsewhere; selecting
      // "Custom range" alone isn't enough to build a valid query, so
      // we don't navigate until the user has picked dates.
      return;
    }
    const qs = buildAnalyticsQueryString({ preset: nextPreset });
    router.push(`/app/analytics${qs}`);
  }

  return (
    <Select value={preset} onChange={handleChange} aria-label="Date range" className="w-[180px]">
      {DATE_RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
        <option key={p} value={p}>
          {DATE_RANGE_PRESET_LABEL[p]}
        </option>
      ))}
    </Select>
  );
}

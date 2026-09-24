"use client";

import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABEL, type DateRangePreset } from "../../analytics/domain/date-range";
import { buildAnalyticsQueryString } from "../../analytics/lib/analytics-query-params";

/** Mirrors analytics/components/date-range-select.tsx exactly, but navigates within /app/intelligence — the query-string builder itself is generic (no analytics-specific path baked in), so it's reused rather than duplicated. */
export function IntelligenceDateRangeSelect({ preset }: { preset: DateRangePreset }) {
  const router = useRouter();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextPreset = event.target.value as DateRangePreset;
    if (nextPreset === "custom") return;
    const qs = buildAnalyticsQueryString({ preset: nextPreset });
    router.push(`/app/intelligence${qs}`);
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

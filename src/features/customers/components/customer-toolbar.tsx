"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

function CustomerToolbar({ initialSearch }: { initialSearch: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (next: string) => {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const qs = next.trim() ? `?q=${encodeURIComponent(next.trim())}` : "";
      router.push(`/app/customers${qs}`);
    }, 400);
  };

  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search by name, phone, or email..."
        aria-label="Search customers"
        className="pl-9"
      />
    </div>
  );
}

export { CustomerToolbar };

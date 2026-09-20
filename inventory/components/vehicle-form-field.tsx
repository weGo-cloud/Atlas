import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";

function VehicleFormField({
  htmlFor,
  label,
  error,
  children,
  className = "",
}: {
  htmlFor: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { VehicleFormField };

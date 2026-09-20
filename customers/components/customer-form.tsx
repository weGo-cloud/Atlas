"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCustomerAction, updateCustomerAction } from "../actions/customer-actions";
import type { Customer } from "../domain/customer";
import type { CustomerFieldErrors } from "../domain/errors";

type CustomerFormMode = "create" | "edit";
type SubmitState = "idle" | "submitting" | "success";

type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

function getInitialValues(customer?: Customer): CustomerFormValues {
  if (!customer) return { name: "", phone: "", email: "", notes: "" };
  return {
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    notes: customer.notes,
  };
}

type CustomerFormProps = {
  mode: CustomerFormMode;
  customer?: Customer;
};

function CustomerForm({ mode, customer }: CustomerFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<CustomerFormValues>(() =>
    getInitialValues(customer)
  );
  const [errors, setErrors] = useState<CustomerFieldErrors>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  const cancelHref =
    mode === "edit" && customer ? `/app/customers/${customer.id}` : "/app/customers";

  const updateField = (field: keyof CustomerFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTopLevelError(null);
    setSubmitState("submitting");

    const input = {
      name: values.name.trim(),
      phone: values.phone.trim() || null,
      email: values.email.trim() || null,
      notes: values.notes.trim(),
    };

    const result =
      mode === "create"
        ? await createCustomerAction(input)
        : await updateCustomerAction(customer!.id, input);

    if (!result.ok) {
      setSubmitState("idle");
      if (result.error.fieldErrors) setErrors(result.error.fieldErrors);
      setTopLevelError(result.error.message);
      return;
    }

    setSubmitState("success");
    const destination = `/app/customers/${result.customer.id}`;
    setTimeout(() => {
      router.push(destination);
      router.refresh();
    }, 500);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Jane Wanjiru"
            />
            {errors.name && (
              <p className="text-xs text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={values.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder="+254 7XX XXX XXX"
            />
            {errors.phone && (
              <p className="text-xs text-destructive" role="alert">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
              placeholder="jane@example.com"
            />
            {errors.email && (
              <p className="text-xs text-destructive" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={values.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Optional context — how you met, preferences, follow-up reminders..."
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {topLevelError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {topLevelError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitState !== "idle"} className="gap-1.5">
          {submitState === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitState === "success" && <CheckCircle2 className="h-4 w-4" />}
          {mode === "create" ? "Add Customer" : "Save Changes"}
        </Button>
        <Button asChild variant="outline" type="button">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export { CustomerForm };

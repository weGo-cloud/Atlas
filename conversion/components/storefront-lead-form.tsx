"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitStorefrontLeadAction } from "../actions/public-actions";
import type { ConversionFieldErrors } from "../domain/lead-intake";

type SubmitState = "idle" | "submitting" | "success";

/**
 * Mission 027 (correction) — the public storefront's lead-capture
 * form. Talks only to submitStorefrontLeadAction — never to
 * LeadService/CustomerService directly — so the entitlement check
 * inside ConversionService is the one and only gate a submission from
 * this form can pass through.
 */
export function StorefrontLeadForm({
  businessId,
  catalogItemId,
  itemNounSingular,
}: {
  businessId: string;
  catalogItemId?: string;
  itemNounSingular: string;
}) {
  const [values, setValues] = useState({ name: "", phone: "", email: "", message: "" });
  const [errors, setErrors] = useState<ConversionFieldErrors>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [state, setState] = useState<SubmitState>("idle");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("submitting");
    setErrors({});
    setTopLevelError(null);

    const result = await submitStorefrontLeadAction(businessId, {
      name: values.name,
      phone: values.phone,
      email: values.email || null,
      message: values.message || null,
      catalogItemId: catalogItemId ?? null,
    });

    if (!result.ok) {
      setState("idle");
      setErrors(result.error.fieldErrors ?? {});
      setTopLevelError(result.error.fieldErrors ? null : result.error.message);
      return;
    }

    setState("success");
  };

  if (state === "success") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-6 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        <p className="text-sm font-medium text-foreground">Thanks — we&apos;ve got your details.</p>
        <p className="text-sm text-muted-foreground">A member of the team will be in touch shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {topLevelError ? <p className="text-sm text-destructive">{topLevelError}</p> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="storefront-name">Your name</Label>
        <Input
          id="storefront-name"
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          required
        />
        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="storefront-phone">Phone number</Label>
        <Input
          id="storefront-phone"
          value={values.phone}
          onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
          required
        />
        {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="storefront-email">Email (optional)</Label>
        <Input
          id="storefront-email"
          type="email"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="storefront-message">
          {catalogItemId ? `What would you like to know about this ${itemNounSingular}?` : "Message (optional)"}
        </Label>
        <Textarea
          id="storefront-message"
          value={values.message}
          onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
        />
      </div>
      <Button type="submit" disabled={state === "submitting"}>
        {state === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Send inquiry
      </Button>
    </form>
  );
}

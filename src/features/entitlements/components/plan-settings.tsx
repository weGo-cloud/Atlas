"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { changePlanAction, cancelSubscriptionAction, resumeSubscriptionAction } from "../actions/subscription-actions";
import type { PlanDefinition, SubscriptionPlan } from "../domain/plan";
import type { Subscription } from "../domain/subscription";

/**
 * Mission 029, Section 4/15 — the minimal commercial UI: current
 * plan, subscription status, what's included/unavailable, current
 * usage against the plan's limit, and an upgrade/downgrade + cancel/
 * resume entry point. Deliberately no checkout, no card form (Section
 * 4/20) — every action here only ever calls a subscription-lifecycle
 * server action, never collects payment information.
 *
 * Reads everything it displays from props the server component
 * already resolved through EntitlementService/the plan catalog
 * (Section 23's "avoid entitlement database queries scattered through
 * every component") — this component only re-derives local optimistic
 * UI state after a successful action, never a plan/capability
 * decision itself.
 */
export function PlanSettings({
  subscription,
  plans,
  vehicleUsage,
  statusMessage,
}: {
  subscription: Subscription | null;
  plans: PlanDefinition[];
  vehicleUsage: number;
  statusMessage: string | null;
}) {
  const [current, setCurrent] = useState(subscription);
  const [pendingDowngrade, setPendingDowngrade] = useState<PlanDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentPlanId: SubscriptionPlan = current?.plan ?? "starter";
  const currentDefinition = plans.find((p) => p.id === currentPlanId) ?? plans[0];

  function runChangePlan(plan: PlanDefinition) {
    setError(null);
    startTransition(async () => {
      const result = await changePlanAction(plan.id);
      if (result.ok) {
        setCurrent(result.subscription);
        setPendingDowngrade(null);
      } else {
        setError(result.error.message);
      }
    });
  }

  function handleSelectPlan(plan: PlanDefinition) {
    if (plan.id === currentPlanId || isPending) return;
    const newLimit = plan.limits.vehicles;
    const isDowngradeOverLimit =
      typeof newLimit === "number" && plan.order < currentDefinition.order && vehicleUsage > newLimit;
    if (isDowngradeOverLimit) {
      setPendingDowngrade(plan);
      return;
    }
    runChangePlan(plan);
  }

  function runCancel(mode: "immediate" | "at_period_end") {
    setError(null);
    startTransition(async () => {
      const result = await cancelSubscriptionAction(mode);
      if (result.ok) setCurrent(result.subscription);
      else setError(result.error.message);
    });
  }

  function runResume() {
    setError(null);
    startTransition(async () => {
      const result = await resumeSubscriptionAction();
      if (result.ok) setCurrent(result.subscription);
      else setError(result.error.message);
    });
  }

  const isCancelled = current?.status === "cancelled" || current?.status === "expired";
  const isPendingCancellation = Boolean(current?.cancelAtPeriodEnd) && !isCancelled;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Plan &amp; billing</CardTitle>
          <Badge variant={current?.status === "active" || current?.status === "trialing" ? "success" : current?.status === "past_due" ? "warning" : "default"}>
            {current?.status ?? "no subscription"}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {statusMessage ? <p className="text-sm text-warning">{statusMessage}</p> : null}
          {isPendingCancellation ? (
            <p className="text-sm text-muted-foreground">
              This subscription is set to cancel at the end of the current billing period.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="text-sm text-muted-foreground">
            Vehicles: {vehicleUsage}
            {currentDefinition.limits.vehicles !== undefined ? ` / ${currentDefinition.limits.vehicles}` : " (unlimited)"}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isCancelled || isPendingCancellation ? (
              <Button variant="default" onClick={runResume} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Resume subscription
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => runCancel("at_period_end")} disabled={isPending}>
                  Cancel at period end
                </Button>
                <Button variant="outline" onClick={() => runCancel("immediate")} disabled={isPending}>
                  Cancel immediately
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compare plans</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col gap-2 rounded-md border p-3 ${plan.id === currentPlanId ? "border-primary" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{plan.name}</span>
                {plan.id === currentPlanId ? <Badge variant="primary">Current</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
              <p className="text-xs text-muted-foreground">
                {plan.pricing.configured ? `${plan.pricing.amount} ${plan.pricing.currency}/${plan.pricing.interval}` : "Pricing not yet configured"}
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                <li className="flex items-center gap-1.5">
                  {plan.limits.vehicles !== undefined ? (
                    <span>{plan.limits.vehicles} vehicles</span>
                  ) : (
                    <span>Unlimited vehicles</span>
                  )}
                </li>
                {plan.capabilities.size > 0 ? (
                  [...plan.capabilities].map((capability) => (
                    <li key={capability} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-success" /> {capability.replace("_", " ")}
                    </li>
                  ))
                ) : (
                  <li className="flex items-center gap-1.5 text-muted-foreground">
                    <X className="h-3.5 w-3.5" /> No add-on capabilities
                  </li>
                )}
              </ul>
              <Button
                variant={plan.id === currentPlanId ? "outline" : "default"}
                disabled={plan.id === currentPlanId || plan.status !== "active" || isPending}
                onClick={() => handleSelectPlan(plan)}
              >
                {plan.id === currentPlanId
                  ? "Current plan"
                  : plan.order > currentDefinition.order
                    ? "Upgrade"
                    : "Downgrade"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={pendingDowngrade !== null} onOpenChange={(open) => !open && setPendingDowngrade(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Downgrade to {pendingDowngrade?.name}?</DialogTitle>
            <DialogDescription>
              Your current inventory ({vehicleUsage} vehicles) exceeds the {pendingDowngrade?.name} plan&apos;s limit
              of {pendingDowngrade?.limits.vehicles} vehicles. Existing vehicles will remain stored, but adding new
              vehicles will be restricted until usage is within the plan limit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDowngrade(null)}>
              Cancel
            </Button>
            <Button onClick={() => pendingDowngrade && runChangePlan(pendingDowngrade)} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm downgrade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

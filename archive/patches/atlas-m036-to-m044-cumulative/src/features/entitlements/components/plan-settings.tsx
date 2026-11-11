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
import { isPaidPlan, type LimitKey, type PlanDefinition, type SubscriptionPlan } from "../domain/plan";
import type { Subscription, SubscriptionStatus } from "../domain/subscription";

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
  storedStatus,
  plans,
  itemUsage,
  itemLabel,
  limitKey,
  statusMessage,
  noticeMessage,
  noticeKind,
  selfServePaidUpgrades,
  upgradeContactCopy,
}: {
  /** Mission 036 — the *effective* subscription (trial/ended plans already resolved to the Starter fallback). */
  subscription: Subscription | null;
  /** The stored row's status, used only to tell a pending-cancellation from an ended plan. */
  storedStatus: SubscriptionStatus | null;
  plans: PlanDefinition[];
  itemUsage: number;
  itemLabel: string;
  limitKey: LimitKey;
  statusMessage: string | null;
  noticeMessage: string | null;
  noticeKind: "trial_active" | "trial_ended" | "subscription_ended" | null;
  selfServePaidUpgrades: boolean;
  upgradeContactCopy: string;
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
    const newLimit = plan.limits[limitKey];
    const isDowngradeOverLimit =
      typeof newLimit === "number" && plan.order < currentDefinition.order && itemUsage > newLimit;
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

  // Mission 036 — an ended trial/plan is not "resumable" from here (it resolves to the free Starter plan and comes back through an upgrade); only a pending cancel-at-period-end can be undone self-serve.
  const hasEnded = storedStatus === "cancelled" || storedStatus === "expired";
  const isPendingCancellation = Boolean(current?.cancelAtPeriodEnd) && !hasEnded;

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
          {noticeMessage ? (
            <p className={`text-sm ${noticeKind === "trial_active" ? "text-foreground" : "text-warning"}`}>{noticeMessage}</p>
          ) : null}
          {statusMessage ? <p className="text-sm text-warning">{statusMessage}</p> : null}
          {isPendingCancellation ? (
            <p className="text-sm text-muted-foreground">
              This subscription is set to cancel at the end of the current billing period.
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="text-sm text-muted-foreground">
            {itemLabel}: {itemUsage}
            {currentDefinition.limits[limitKey] !== undefined ? ` / ${currentDefinition.limits[limitKey]}` : " (unlimited)"}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPendingCancellation ? (
              <Button variant="default" onClick={runResume} disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Keep my subscription
              </Button>
            ) : hasEnded || currentPlanId === "starter" ? null : (
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
                {plan.pricing.configured
                  ? plan.pricing.amount === 0
                    ? "Free"
                    : `${plan.pricing.currency} ${plan.pricing.amount.toLocaleString("en-KE")}/${plan.pricing.interval === "monthly" ? "month" : plan.pricing.interval}`
                  : "Contact us for pricing"}
              </p>
              <ul className="flex flex-col gap-1 text-sm">
                <li className="flex items-center gap-1.5">
                  {plan.limits[limitKey] !== undefined ? (
                    <span>{plan.limits[limitKey]} items</span>
                  ) : (
                    <span>Unlimited items</span>
                  )}
                </li>
                {plan.capabilities.size > 0 ? (
                  [...plan.capabilities].map((capability) => (
                    <li key={capability} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-success" /> {capability.replaceAll("_", " ")}
                    </li>
                  ))
                ) : (
                  <li className="flex items-center gap-1.5 text-muted-foreground">
                    <X className="h-3.5 w-3.5" /> No add-on capabilities
                  </li>
                )}
              </ul>
              {!selfServePaidUpgrades && isPaidPlan(plan.id) && plan.id !== currentPlanId ? (
                <p className="text-xs text-muted-foreground">{upgradeContactCopy}</p>
              ) : (
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
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={pendingDowngrade !== null} onOpenChange={(open) => !open && setPendingDowngrade(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Downgrade to {pendingDowngrade?.name}?</DialogTitle>
            <DialogDescription>
              Your current inventory ({itemUsage} items) exceeds the {pendingDowngrade?.name} plan&apos;s limit of{" "}
              {pendingDowngrade?.limits[limitKey]} items. Everything you have stays stored, but adding new items
              will be restricted until you are within the plan limit.
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

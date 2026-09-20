"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCustomerAction, searchCustomersAction } from "@/features/customers/actions/customer-actions";
import type { Customer } from "@/features/customers/domain/customer";
import { searchVehiclesAction } from "@/features/inventory/actions/vehicle-actions";
import type { Vehicle } from "@/features/inventory/data/types";
import { createLeadAction } from "../actions/lead-actions";

type CustomerPickerMode = "select" | "create";

type CreateLeadDialogProps = {
  /** Preselect a vehicle (e.g. opened from that vehicle's page) — hides the vehicle picker entirely. */
  vehicleId?: string;
  /** Preselect a customer (e.g. opened from that customer's page) — hides the customer picker entirely. */
  customerId?: string;
  /** Display name for a preselected customer. Required if `customerId` is set. */
  customerName?: string;
  triggerLabel?: string;
}

/**
 * Mission 015 — generalizes what used to be vehicle-only lead
 * creation (AddCustomerInterestDialog) so a lead can be created from
 * the Leads page (pick both customer and vehicle) or the Customer
 * page (customer preset, vehicle optional) too — not just from a
 * vehicle's own page. The domain has always supported a vehicle-less
 * "general interest" lead; there was just no UI path to create one.
 */
function CreateLeadDialog({ vehicleId, customerId, customerName, triggerLabel }: CreateLeadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerMode, setCustomerMode] = useState<CustomerPickerMode>("select");

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const customerDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [vehicleSearch, setVehicleSearch] = useState("");
  const [vehicleResults, setVehicleResults] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const vehicleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showCustomerPicker = !customerId;
  const showVehiclePicker = !vehicleId;

  const resetState = () => {
    setCustomerMode("select");
    setCustomerSearch("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
    setVehicleSearch("");
    setVehicleResults([]);
    setSelectedVehicle(null);
    setSource("");
    setNotes("");
    setNextFollowUpAt("");
    setError(null);
  };

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    setSelectedCustomer(null);
    if (customerDebounce.current) clearTimeout(customerDebounce.current);
    customerDebounce.current = setTimeout(async () => {
      setCustomerResults(await searchCustomersAction(value));
    }, 300);
  };

  const handleVehicleSearchChange = (value: string) => {
    setVehicleSearch(value);
    setSelectedVehicle(null);
    if (vehicleDebounce.current) clearTimeout(vehicleDebounce.current);
    vehicleDebounce.current = setTimeout(async () => {
      setVehicleResults(await searchVehiclesAction(value));
    }, 300);
  };

  const handleSubmit = async () => {
    setError(null);

    let resolvedCustomerId: string;

    if (!showCustomerPicker) {
      resolvedCustomerId = customerId!;
    } else if (customerMode === "select") {
      if (!selectedCustomer) {
        setError('Select a customer, or switch to "New customer".');
        return;
      }
      resolvedCustomerId = selectedCustomer.id;
    } else {
      if (!newName.trim()) {
        setError("Name is required for a new customer.");
        return;
      }
      setSubmitting(true);
      const customerResult = await createCustomerAction({
        name: newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
      });
      if (!customerResult.ok) {
        setSubmitting(false);
        setError(customerResult.error.message);
        return;
      }
      resolvedCustomerId = customerResult.customer.id;
    }

    setSubmitting(true);
    const leadResult = await createLeadAction({
      customerId: resolvedCustomerId,
      vehicleId: vehicleId ?? selectedVehicle?.id ?? null,
      source: source.trim(),
      notes: notes.trim(),
      nextFollowUpAt: nextFollowUpAt || null,
    });
    setSubmitting(false);

    if (!leadResult.ok) {
      setError(leadResult.error.message);
      return;
    }

    setOpen(false);
    resetState();
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {triggerLabel ?? "New Lead"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            {customerId
              ? "Log a new opportunity for this customer."
              : "Link an existing customer, or create a new one, to a fresh opportunity."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!showCustomerPicker ? (
            <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <span className="text-muted-foreground">Customer: </span>
              <span className="font-medium text-foreground">{customerName}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="inline-flex w-fit rounded-md border border-border bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setCustomerMode("select")}
                  className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                    customerMode === "select"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Existing customer
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode("create")}
                  className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                    customerMode === "create"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  New customer
                </button>
              </div>

              {customerMode === "select" ? (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
                    <Input
                      value={customerSearch}
                      onChange={(e) => handleCustomerSearchChange(e.target.value)}
                      placeholder="Search by name, phone, or email..."
                      className="pl-9"
                    />
                  </div>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                      <span className="font-medium text-foreground">{selectedCustomer.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    customerResults.length > 0 && (
                      <ul className="max-h-32 overflow-y-auto rounded-md border border-border">
                        {customerResults.map((customer) => (
                          <li key={customer.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setCustomerResults([]);
                              }}
                              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                            >
                              <span className="font-medium text-foreground">{customer.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {customer.phone ?? customer.email ?? "No contact info"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-customer-name">Name</Label>
                    <Input
                      id="new-customer-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Jane Wanjiru"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="new-customer-phone">Phone</Label>
                      <Input
                        id="new-customer-phone"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+254 7XX XXX XXX"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="new-customer-email">Email</Label>
                      <Input
                        id="new-customer-email"
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="jane@example.com"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {showVehiclePicker && (
            <div className="flex flex-col gap-2">
              <Label>Vehicle (optional)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
                <Input
                  value={vehicleSearch}
                  onChange={(e) => handleVehicleSearchChange(e.target.value)}
                  placeholder="Search stock ID, make, or model..."
                  className="pl-9"
                />
              </div>
              {selectedVehicle ? (
                <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium text-foreground">
                    {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedVehicle(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Change
                  </button>
                </div>
              ) : (
                vehicleResults.length > 0 && (
                  <ul className="max-h-32 overflow-y-auto rounded-md border border-border">
                    {vehicleResults.map((vehicle) => (
                      <li key={vehicle.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedVehicle(vehicle);
                            setVehicleResults([]);
                          }}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                        >
                          <span className="font-medium text-foreground">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </span>
                          <span className="text-xs text-muted-foreground">Stock #{vehicle.stockId}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
              <p className="text-xs text-muted-foreground">
                Leave blank for a general interest not yet tied to a specific vehicle.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-source">Source (optional)</Label>
            <Input
              id="lead-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Walk-in, phone call, referral..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-follow-up">Next follow-up (optional)</Label>
            <Input
              id="lead-follow-up"
              type="date"
              value={nextFollowUpAt}
              onChange={(e) => setNextFollowUpAt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-notes">Notes (optional)</Label>
            <Textarea id="lead-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { CreateLeadDialog };

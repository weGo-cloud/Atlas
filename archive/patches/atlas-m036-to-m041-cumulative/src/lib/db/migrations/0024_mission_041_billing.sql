CREATE TABLE `billing_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`plan` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`due_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`checkout_request_id` text,
	`merchant_request_id` text,
	`payer_phone` text,
	`payment_state` text DEFAULT 'none' NOT NULL,
	`receipt` text,
	`failure_reason` text,
	`paid_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `billing_invoices_business_id_idx` ON `billing_invoices` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_invoices_one_open_per_business` ON `billing_invoices` (`business_id`) WHERE "billing_invoices"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX `billing_invoices_checkout_unique` ON `billing_invoices` (`checkout_request_id`) WHERE "billing_invoices"."checkout_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `billing_invoices_receipt_unique` ON `billing_invoices` (`receipt`) WHERE "billing_invoices"."receipt" is not null;--> statement-breakpoint
-- Mission 041: invoices are a financial record. Same tamper-resistance as the payments ledger.
CREATE TRIGGER `billing_invoices_no_delete` BEFORE DELETE ON `billing_invoices`
BEGIN SELECT RAISE(ABORT, 'invoices are append-only: void instead of deleting'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_invoices_immutable_fields` BEFORE UPDATE ON `billing_invoices`
WHEN OLD.id IS NOT NEW.id OR OLD.business_id IS NOT NEW.business_id OR OLD.plan IS NOT NEW.plan
  OR OLD.amount IS NOT NEW.amount OR OLD.currency IS NOT NEW.currency OR OLD.kind IS NOT NEW.kind
  OR OLD.period_start IS NOT NEW.period_start OR OLD.period_end IS NOT NEW.period_end
  OR OLD.due_at IS NOT NEW.due_at OR OLD.created_at IS NOT NEW.created_at
BEGIN SELECT RAISE(ABORT, 'invoice plan, amount, period and due date are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_invoices_status_forward_only` BEFORE UPDATE OF status ON `billing_invoices`
WHEN OLD.status IN ('paid', 'uncollectible', 'void') AND NEW.status IS NOT OLD.status
BEGIN SELECT RAISE(ABORT, 'a paid, uncollectible or void invoice cannot change status again'); END;
--> statement-breakpoint
CREATE TRIGGER `billing_invoices_paid_needs_receipt_or_query` BEFORE UPDATE OF status ON `billing_invoices`
WHEN NEW.status = 'paid' AND OLD.status IS NOT 'paid' AND NEW.paid_at IS NULL
BEGIN SELECT RAISE(ABORT, 'a paid invoice must carry paid_at'); END;

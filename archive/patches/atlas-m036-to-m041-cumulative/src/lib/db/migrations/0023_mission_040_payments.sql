CREATE TABLE `payment_accounts` (
	`business_id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'mpesa_daraja' NOT NULL,
	`environment` text DEFAULT 'sandbox' NOT NULL,
	`shortcode` text NOT NULL,
	`till_number` text,
	`transaction_type` text DEFAULT 'paybill' NOT NULL,
	`consumer_key_enc` text NOT NULL,
	`consumer_secret_enc` text NOT NULL,
	`passkey_enc` text NOT NULL,
	`callback_token` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_accounts_callback_token_unique` ON `payment_accounts` (`callback_token`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`payment_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_events_business_id_idx` ON `payment_events` (`business_id`);--> statement-breakpoint
CREATE INDEX `payment_events_payment_id_idx` ON `payment_events` (`payment_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`deal_id` text,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`method` text NOT NULL,
	`kind` text DEFAULT 'installment' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`reference` text,
	`payer_phone` text,
	`payer_name` text,
	`item_label` text,
	`paid_at` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`recorded_by_user_id` text,
	`checkout_request_id` text,
	`merchant_request_id` text,
	`failure_reason` text,
	`reversed_at` text,
	`reversed_reason` text,
	`reversed_by_user_id` text,
	`verification` text DEFAULT 'manual' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payments_business_id_idx` ON `payments` (`business_id`);--> statement-breakpoint
CREATE INDEX `payments_deal_id_idx` ON `payments` (`deal_id`);--> statement-breakpoint
CREATE INDEX `payments_customer_id_idx` ON `payments` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_business_method_reference_unique` ON `payments` (`business_id`,`method`,`reference`) WHERE "payments"."reference" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_checkout_request_unique` ON `payments` (`checkout_request_id`) WHERE "payments"."checkout_request_id" is not null;--> statement-breakpoint
-- Mission 040: tamper-resistance. The ledger is append-only; these triggers hold even if application code (or a
-- hand-run SQL statement) tries to rewrite history. Only status/failure/reference/reversal bookkeeping may change.
CREATE TRIGGER `payments_no_delete` BEFORE DELETE ON `payments`
BEGIN SELECT RAISE(ABORT, 'payments are append-only: reverse instead of deleting'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_immutable_fields` BEFORE UPDATE ON `payments`
WHEN OLD.id IS NOT NEW.id OR OLD.business_id IS NOT NEW.business_id OR OLD.customer_id IS NOT NEW.customer_id
  OR OLD.amount IS NOT NEW.amount OR OLD.currency IS NOT NEW.currency OR OLD.method IS NOT NEW.method
  OR OLD.kind IS NOT NEW.kind OR (OLD.paid_at IS NOT NEW.paid_at AND OLD.status IS NOT 'pending') OR OLD.recorded_by_user_id IS NOT NEW.recorded_by_user_id
  OR OLD.created_at IS NOT NEW.created_at
BEGIN SELECT RAISE(ABORT, 'payment amount, method, customer and dates are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_status_forward_only` BEFORE UPDATE OF status ON `payments`
WHEN OLD.status IN ('failed', 'cancelled', 'reversed') AND NEW.status IS NOT OLD.status
BEGIN SELECT RAISE(ABORT, 'a failed, cancelled or reversed payment cannot change status again'); END;
--> statement-breakpoint
CREATE TRIGGER `payments_provider_verification_locked` BEFORE UPDATE OF verification ON `payments`
WHEN OLD.verification IS NOT NEW.verification
BEGIN SELECT RAISE(ABORT, 'verification cannot be changed after the payment is recorded'); END;
--> statement-breakpoint
CREATE TRIGGER `payment_events_no_update` BEFORE UPDATE ON `payment_events`
BEGIN SELECT RAISE(ABORT, 'payment events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `payment_events_no_delete` BEFORE DELETE ON `payment_events`
BEGIN SELECT RAISE(ABORT, 'payment events are append-only'); END;

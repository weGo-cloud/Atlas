CREATE TABLE `c2b_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`trans_id` text NOT NULL,
	`amount_kes` integer,
	`amount_raw` text NOT NULL,
	`bill_ref` text,
	`payer_phone` text,
	`payer_name` text,
	`paid_at` text NOT NULL,
	`status` text DEFAULT 'unallocated' NOT NULL,
	`allocated_payment_id` text,
	`allocated_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `c2b_payments_business_trans_unique` ON `c2b_payments` (`business_id`,`trans_id`);--> statement-breakpoint
CREATE INDEX `c2b_payments_business_status_idx` ON `c2b_payments` (`business_id`,`status`);--> statement-breakpoint
ALTER TABLE `payment_accounts` ADD `c2b_registered_token` text;--> statement-breakpoint
-- Mission 043: the inbox is a financial record. Facts never change; the only moves are unallocated -> allocated | ignored,
-- plus releasing a claim that never produced a payment.
CREATE TRIGGER `c2b_payments_no_delete` BEFORE DELETE ON `c2b_payments`
BEGIN SELECT RAISE(ABORT, 'M-Pesa notifications are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `c2b_payments_facts_immutable` BEFORE UPDATE ON `c2b_payments`
WHEN OLD.id IS NOT NEW.id OR OLD.business_id IS NOT NEW.business_id OR OLD.trans_id IS NOT NEW.trans_id
  OR OLD.amount_kes IS NOT NEW.amount_kes OR OLD.amount_raw IS NOT NEW.amount_raw OR OLD.paid_at IS NOT NEW.paid_at OR OLD.created_at IS NOT NEW.created_at
BEGIN SELECT RAISE(ABORT, 'notification facts are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `c2b_payments_status_rules` BEFORE UPDATE OF status ON `c2b_payments`
WHEN OLD.status IN ('allocated', 'ignored') AND NEW.status IS NOT OLD.status
  AND NOT (OLD.status = 'allocated' AND NEW.status = 'unallocated' AND OLD.allocated_payment_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'an allocated or ignored notification cannot change status again'); END;

CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`plan` text DEFAULT 'starter' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`trial_ends_at` text,
	`current_period_start` text,
	`current_period_end` text,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`provider` text,
	`provider_customer_id` text,
	`provider_subscription_id` text,
	`provider_status` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_business_id_unique` ON `subscriptions` (`business_id`);
--> statement-breakpoint
-- Mission 028 — backfill: every business that already had a plan
-- value (from Mission 027's correction) gets a subscription row
-- carrying that same plan forward, status 'active' (Section 16's
-- "development-safe default" — nothing before this mission depended
-- on trial/past_due semantics, so 'active' preserves exactly the
-- access every existing business already had, no regression).
INSERT INTO `subscriptions` (`id`, `business_id`, `plan`, `status`, `created_at`, `updated_at`)
SELECT 'sub_' || `id`, `id`, `plan`, 'active', `created_at`, `updated_at`
FROM `businesses`;
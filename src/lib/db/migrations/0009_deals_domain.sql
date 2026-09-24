CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`vehicle_id` text,
	`vehicle_label` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`agreed_price` integer NOT NULL,
	`deposit_amount` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deals_business_id_idx` ON `deals` (`business_id`);--> statement-breakpoint
CREATE INDEX `deals_customer_id_idx` ON `deals` (`customer_id`);--> statement-breakpoint
CREATE INDEX `deals_lead_id_idx` ON `deals` (`lead_id`);--> statement-breakpoint
CREATE INDEX `deals_vehicle_id_idx` ON `deals` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `deals_status_idx` ON `deals` (`status`);--> statement-breakpoint
CREATE INDEX `deals_created_at_idx` ON `deals` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `deals_lead_id_active_uidx` ON `deals` (`lead_id`) WHERE "deals"."status" not in ('completed', 'cancelled');
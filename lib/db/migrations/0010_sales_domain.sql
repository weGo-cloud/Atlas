CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`deal_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`vehicle_id` text,
	`vehicle_label` text,
	`sale_amount` integer NOT NULL,
	`sold_at` text DEFAULT (current_timestamp) NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sales_business_id_idx` ON `sales` (`business_id`);--> statement-breakpoint
CREATE INDEX `sales_customer_id_idx` ON `sales` (`customer_id`);--> statement-breakpoint
CREATE INDEX `sales_sold_at_idx` ON `sales` (`sold_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_deal_id_uidx` ON `sales` (`deal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_vehicle_id_uidx` ON `sales` (`vehicle_id`);
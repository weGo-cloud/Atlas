CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`stock_id` text NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`mileage` integer NOT NULL,
	`price` integer NOT NULL,
	`status` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`added_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_stock_id_unique` ON `vehicles` (`stock_id`);--> statement-breakpoint
CREATE INDEX `vehicles_stock_id_idx` ON `vehicles` (`stock_id`);--> statement-breakpoint
CREATE INDEX `vehicles_status_idx` ON `vehicles` (`status`);
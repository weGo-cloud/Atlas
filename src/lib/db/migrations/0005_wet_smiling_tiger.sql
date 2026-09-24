CREATE TABLE `businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `users_business_id_idx` ON `users` (`business_id`);--> statement-breakpoint
ALTER TABLE `customers` ADD `business_id` text REFERENCES businesses(id);--> statement-breakpoint
CREATE INDEX `customers_business_id_idx` ON `customers` (`business_id`);--> statement-breakpoint
ALTER TABLE `leads` ADD `business_id` text REFERENCES businesses(id);--> statement-breakpoint
CREATE INDEX `leads_business_id_idx` ON `leads` (`business_id`);--> statement-breakpoint
ALTER TABLE `vehicles` ADD `business_id` text REFERENCES businesses(id);--> statement-breakpoint
CREATE INDEX `vehicles_business_id_idx` ON `vehicles` (`business_id`);
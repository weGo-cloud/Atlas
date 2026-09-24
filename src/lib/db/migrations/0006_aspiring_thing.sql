PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_customers`("id", "business_id", "name", "phone", "email", "notes", "created_at", "updated_at") SELECT "id", "business_id", "name", "phone", "email", "notes", "created_at", "updated_at" FROM `customers`;--> statement-breakpoint
DROP TABLE `customers`;--> statement-breakpoint
ALTER TABLE `__new_customers` RENAME TO `customers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `customers_business_id_idx` ON `customers` (`business_id`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `customers_phone_idx` ON `customers` (`phone`);--> statement-breakpoint
CREATE INDEX `customers_email_idx` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `__new_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`vehicle_id` text,
	`vehicle_label` text,
	`status` text DEFAULT 'new' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_leads`("id", "business_id", "customer_id", "vehicle_id", "vehicle_label", "status", "source", "notes", "created_at", "updated_at") SELECT "id", "business_id", "customer_id", "vehicle_id", "vehicle_label", "status", "source", "notes", "created_at", "updated_at" FROM `leads`;--> statement-breakpoint
DROP TABLE `leads`;--> statement-breakpoint
ALTER TABLE `__new_leads` RENAME TO `leads`;--> statement-breakpoint
CREATE INDEX `leads_business_id_idx` ON `leads` (`business_id`);--> statement-breakpoint
CREATE INDEX `leads_customer_id_idx` ON `leads` (`customer_id`);--> statement-breakpoint
CREATE INDEX `leads_vehicle_id_idx` ON `leads` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`);--> statement-breakpoint
CREATE INDEX `leads_created_at_idx` ON `leads` (`created_at`);--> statement-breakpoint
CREATE TABLE `__new_vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`stock_id` text NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`mileage` integer NOT NULL,
	`price` integer NOT NULL,
	`status` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`added_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_vehicles`("id", "business_id", "stock_id", "make", "model", "year", "mileage", "price", "status", "description", "added_at", "updated_at") SELECT "id", "business_id", "stock_id", "make", "model", "year", "mileage", "price", "status", "description", "added_at", "updated_at" FROM `vehicles`;--> statement-breakpoint
DROP TABLE `vehicles`;--> statement-breakpoint
ALTER TABLE `__new_vehicles` RENAME TO `vehicles`;--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_stock_id_unique` ON `vehicles` (`stock_id`);--> statement-breakpoint
CREATE INDEX `vehicles_business_id_idx` ON `vehicles` (`business_id`);--> statement-breakpoint
CREATE INDEX `vehicles_status_idx` ON `vehicles` (`status`);--> statement-breakpoint
CREATE INDEX `vehicles_price_idx` ON `vehicles` (`price`);--> statement-breakpoint
CREATE INDEX `vehicles_year_idx` ON `vehicles` (`year`);--> statement-breakpoint
CREATE INDEX `vehicles_added_at_idx` ON `vehicles` (`added_at`);
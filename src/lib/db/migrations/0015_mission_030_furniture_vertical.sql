CREATE TABLE `furniture_product_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`furniture_product_id` text NOT NULL,
	`url` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`furniture_product_id`) REFERENCES `furniture_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `furniture_product_photos_product_id_idx` ON `furniture_product_photos` (`furniture_product_id`);--> statement-breakpoint
CREATE TABLE `furniture_products` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`price` integer NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`condition` text NOT NULL,
	`status` text NOT NULL,
	`material` text,
	`color` text,
	`dimensions` text,
	`sku` text,
	`added_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `furniture_products_business_id_idx` ON `furniture_products` (`business_id`);--> statement-breakpoint
CREATE INDEX `furniture_products_status_idx` ON `furniture_products` (`status`);--> statement-breakpoint
CREATE INDEX `furniture_products_category_idx` ON `furniture_products` (`category`);--> statement-breakpoint
CREATE INDEX `furniture_products_price_idx` ON `furniture_products` (`price`);--> statement-breakpoint
CREATE INDEX `furniture_products_added_at_idx` ON `furniture_products` (`added_at`);--> statement-breakpoint
ALTER TABLE `leads` ADD `furniture_product_id` text REFERENCES furniture_products(id);--> statement-breakpoint
ALTER TABLE `leads` ADD `furniture_product_label` text;--> statement-breakpoint
CREATE INDEX `leads_furniture_product_id_idx` ON `leads` (`furniture_product_id`);
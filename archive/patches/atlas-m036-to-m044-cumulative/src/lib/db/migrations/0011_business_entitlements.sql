ALTER TABLE `businesses` ADD `plan` text DEFAULT 'starter' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `vertical` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `storefront_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `public_api_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_public_api_key_unique` ON `businesses` (`public_api_key`);
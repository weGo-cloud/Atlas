ALTER TABLE `assistant_settings` ADD `meta_page_id` text;--> statement-breakpoint
ALTER TABLE `assistant_settings` ADD `instagram_account_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_settings_meta_page_unique` ON `assistant_settings` (`meta_page_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_settings_ig_account_unique` ON `assistant_settings` (`instagram_account_id`);
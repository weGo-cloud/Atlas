ALTER TABLE `social_posts` ADD `format` text DEFAULT 'square' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `scheduled_for` text;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `channel` text;
--> statement-breakpoint
ALTER TABLE `social_posts` ADD `posted_at` text;
--> statement-breakpoint
CREATE INDEX `social_posts_business_status_scheduled_idx` ON `social_posts` (`business_id`,`status`,`scheduled_for`);
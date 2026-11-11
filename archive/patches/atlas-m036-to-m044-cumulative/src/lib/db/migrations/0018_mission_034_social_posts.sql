CREATE TABLE `social_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`template_id` text NOT NULL,
	`photo_url` text NOT NULL,
	`caption` text NOT NULL,
	`image_url` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`approved_at` text,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `social_posts_business_created_idx` ON `social_posts` (`business_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `social_posts_business_item_idx` ON `social_posts` (`business_id`,`item_type`,`item_id`);
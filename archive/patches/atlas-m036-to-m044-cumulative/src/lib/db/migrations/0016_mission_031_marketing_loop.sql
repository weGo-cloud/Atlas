CREATE TABLE `marketing_channel_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'not_connected' NOT NULL,
	`external_account_label` text,
	`access_token` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `marketing_channel_connections_business_id_idx` ON `marketing_channel_connections` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_channel_connections_business_channel_unique` ON `marketing_channel_connections` (`business_id`,`channel`);--> statement-breakpoint
CREATE TABLE `marketing_content` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`generation_method` text NOT NULL,
	`social_caption` text NOT NULL,
	`whatsapp_message` text NOT NULL,
	`grounded_facts_json` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `marketing_content_business_id_idx` ON `marketing_content` (`business_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `marketing_content_item_unique` ON `marketing_content` (`business_id`,`item_type`,`item_id`);--> statement-breakpoint
CREATE TABLE `marketing_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`marketing_content_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`is_simulated` integer NOT NULL,
	`external_id` text,
	`error_message` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marketing_content_id`) REFERENCES `marketing_content`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `marketing_publications_business_id_idx` ON `marketing_publications` (`business_id`);--> statement-breakpoint
CREATE INDEX `marketing_publications_content_id_idx` ON `marketing_publications` (`marketing_content_id`);
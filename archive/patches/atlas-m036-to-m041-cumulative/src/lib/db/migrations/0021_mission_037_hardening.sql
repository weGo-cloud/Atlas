CREATE TABLE `ai_usage_counters` (
	`scope` text NOT NULL,
	`day` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_counters_scope_day_unique` ON `ai_usage_counters` (`scope`,`day`);--> statement-breakpoint
ALTER TABLE `businesses` ADD `public_api_key_hash` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `public_api_key_hint` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `public_api_allowed_origins` text;--> statement-breakpoint
CREATE UNIQUE INDEX `businesses_public_api_key_hash_unique` ON `businesses` (`public_api_key_hash`);
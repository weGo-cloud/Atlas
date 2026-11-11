CREATE TABLE `assistant_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`channel` text NOT NULL,
	`customer_key` text NOT NULL,
	`customer_name` text,
	`state` text DEFAULT 'bot' NOT NULL,
	`context_json` text DEFAULT '{}' NOT NULL,
	`lead_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assistant_conversations_business_updated_idx` ON `assistant_conversations` (`business_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `assistant_conversations_customer_idx` ON `assistant_conversations` (`business_id`,`channel`,`customer_key`);--> statement-breakpoint
CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`business_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_events_json` text,
	`external_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assistant_messages_conversation_idx` ON `assistant_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_messages_external_id_unique` ON `assistant_messages` (`external_id`);--> statement-breakpoint
CREATE TABLE `assistant_settings` (
	`business_id` text PRIMARY KEY NOT NULL,
	`assistant_enabled` integer DEFAULT true NOT NULL,
	`display_name` text,
	`opening_hours` text,
	`location` text,
	`delivery_policy` text,
	`payment_methods` text,
	`greeting` text,
	`tone` text DEFAULT 'friendly' NOT NULL,
	`handoff_topics` text,
	`whatsapp_phone_number_id` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_settings_wa_phone_unique` ON `assistant_settings` (`whatsapp_phone_number_id`);
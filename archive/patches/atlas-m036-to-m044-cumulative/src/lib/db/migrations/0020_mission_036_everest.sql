CREATE TABLE IF NOT EXISTS `everest_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`pending_action_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`args_json` text NOT NULL,
	`before_json` text DEFAULT '[]' NOT NULL,
	`outcome` text NOT NULL,
	`detail` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `everest_audit_log_business_idx` ON `everest_audit_log` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `everest_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text DEFAULT 'New chat' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `everest_conversations_business_user_idx` ON `everest_conversations` (`business_id`,`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `everest_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `everest_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `everest_messages_conversation_idx` ON `everest_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `everest_messages_business_role_created_idx` ON `everest_messages` (`business_id`,`role`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `everest_pending_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`message_id` text,
	`tool_name` text NOT NULL,
	`args_json` text NOT NULL,
	`summary` text NOT NULL,
	`changes_json` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`result_ok` integer,
	`result_message` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`expires_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `everest_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `everest_pending_actions_business_idx` ON `everest_pending_actions` (`business_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `everest_pending_actions_conversation_idx` ON `everest_pending_actions` (`conversation_id`);
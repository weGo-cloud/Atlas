ALTER TABLE `leads` ADD `last_contacted_at` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `next_follow_up_at` text;--> statement-breakpoint
CREATE INDEX `leads_next_follow_up_at_idx` ON `leads` (`next_follow_up_at`);--> statement-breakpoint
-- Mission 015: "closed" was an ambiguous terminal-status label (dashboard
-- already bucketed it with "lost" as terminal, but it never distinguished
-- a successful outcome from a failed one). Renamed to "won" with the same
-- terminal meaning — this is a rename, not a behavior change, and no other
-- status value is affected. Existing rows are preserved, not dropped.
UPDATE `leads` SET `status` = 'won' WHERE `status` = 'closed';
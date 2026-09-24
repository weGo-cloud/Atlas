ALTER TABLE `businesses` ADD `website_mode` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
-- Mission 028 — backfill: a business that had already turned the
-- old boolean storefront switch on carries that forward as the
-- equivalent new state.
UPDATE `businesses` SET `website_mode` = 'atlas_hosted' WHERE `storefront_enabled` = 1;
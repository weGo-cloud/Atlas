DROP INDEX `vehicles_stock_id_idx`;--> statement-breakpoint
CREATE INDEX `vehicles_price_idx` ON `vehicles` (`price`);--> statement-breakpoint
CREATE INDEX `vehicles_year_idx` ON `vehicles` (`year`);--> statement-breakpoint
CREATE INDEX `vehicles_added_at_idx` ON `vehicles` (`added_at`);
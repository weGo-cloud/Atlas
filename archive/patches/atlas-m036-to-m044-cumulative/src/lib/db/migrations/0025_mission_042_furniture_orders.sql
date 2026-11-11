CREATE TABLE `furniture_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`business_id` text NOT NULL,
	`product_id` text,
	`name` text NOT NULL,
	`sku` text,
	`unit_price` integer NOT NULL,
	`quantity` integer NOT NULL,
	`line_total` integer NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `furniture_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `furniture_products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `furniture_order_lines_order_id_idx` ON `furniture_order_lines` (`order_id`);--> statement-breakpoint
CREATE TABLE `furniture_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`reference` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`delivery_fee` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`delivery_address` text,
	`delivery_date` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_by_user_id` text,
	`confirmed_at` text,
	`fulfilled_at` text,
	`cancelled_at` text,
	`cancelled_reason` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`business_id`) REFERENCES `businesses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `furniture_orders_business_id_idx` ON `furniture_orders` (`business_id`);--> statement-breakpoint
CREATE INDEX `furniture_orders_customer_id_idx` ON `furniture_orders` (`customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `furniture_orders_business_reference_unique` ON `furniture_orders` (`business_id`,`reference`);--> statement-breakpoint
ALTER TABLE `furniture_products` ADD `stock_quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `order_id` text REFERENCES furniture_orders(id);--> statement-breakpoint
-- Mission 042: existing products were single-unit: sold ones have no stock left.
UPDATE `furniture_products` SET `stock_quantity` = 0 WHERE `status` = 'sold';
--> statement-breakpoint
-- A payment counts toward a vehicle deal OR a furniture order, never both; the target can never be moved afterwards.
CREATE TRIGGER `payments_single_subject` BEFORE INSERT ON `payments`
WHEN NEW.deal_id IS NOT NULL AND NEW.order_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a payment belongs to a deal or an order, not both'); END;
--> statement-breakpoint
DROP TRIGGER `payments_immutable_fields`;
--> statement-breakpoint
CREATE TRIGGER `payments_immutable_fields` BEFORE UPDATE ON `payments`
WHEN OLD.id IS NOT NEW.id OR OLD.business_id IS NOT NEW.business_id OR OLD.customer_id IS NOT NEW.customer_id
  OR OLD.amount IS NOT NEW.amount OR OLD.currency IS NOT NEW.currency OR OLD.method IS NOT NEW.method
  OR OLD.kind IS NOT NEW.kind OR (OLD.paid_at IS NOT NEW.paid_at AND OLD.status IS NOT 'pending') OR OLD.recorded_by_user_id IS NOT NEW.recorded_by_user_id
  OR OLD.created_at IS NOT NEW.created_at OR OLD.order_id IS NOT NEW.order_id
BEGIN SELECT RAISE(ABORT, 'payment amount, method, customer, order and dates are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `furniture_orders_no_delete` BEFORE DELETE ON `furniture_orders`
BEGIN SELECT RAISE(ABORT, 'orders are append-only: cancel instead of deleting'); END;
--> statement-breakpoint
CREATE TRIGGER `furniture_orders_identity_immutable` BEFORE UPDATE ON `furniture_orders`
WHEN OLD.id IS NOT NEW.id OR OLD.business_id IS NOT NEW.business_id OR OLD.customer_id IS NOT NEW.customer_id
  OR OLD.reference IS NOT NEW.reference OR OLD.created_at IS NOT NEW.created_at
BEGIN SELECT RAISE(ABORT, 'order identity (business, customer, reference) is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `furniture_orders_status_forward_only` BEFORE UPDATE OF status ON `furniture_orders`
WHEN NEW.status IS NOT OLD.status AND NOT (
     (OLD.status = 'draft' AND NEW.status IN ('confirmed', 'cancelled'))
  OR (OLD.status = 'confirmed' AND NEW.status IN ('fulfilled', 'cancelled')))
BEGIN SELECT RAISE(ABORT, 'invalid order status change'); END;
--> statement-breakpoint
CREATE TRIGGER `furniture_orders_total_locked` BEFORE UPDATE ON `furniture_orders`
WHEN OLD.status IS NOT 'draft' AND (OLD.subtotal IS NOT NEW.subtotal OR OLD.delivery_fee IS NOT NEW.delivery_fee OR OLD.discount IS NOT NEW.discount OR OLD.total IS NOT NEW.total)
BEGIN SELECT RAISE(ABORT, 'a confirmed order''s totals cannot change'); END;
--> statement-breakpoint
CREATE TRIGGER `furniture_order_lines_insert_only_in_draft` BEFORE INSERT ON `furniture_order_lines`
WHEN (SELECT status FROM `furniture_orders` WHERE id = NEW.order_id) IS NOT 'draft'
BEGIN SELECT RAISE(ABORT, 'order lines can only be added while the order is a draft'); END;
--> statement-breakpoint
CREATE TRIGGER `furniture_order_lines_update_only_in_draft` BEFORE UPDATE ON `furniture_order_lines`
WHEN (SELECT status FROM `furniture_orders` WHERE id = OLD.order_id) IS NOT 'draft'
BEGIN SELECT RAISE(ABORT, 'order lines can only be changed while the order is a draft'); END;
--> statement-breakpoint
CREATE TRIGGER `furniture_order_lines_delete_only_in_draft` BEFORE DELETE ON `furniture_order_lines`
WHEN (SELECT status FROM `furniture_orders` WHERE id = OLD.order_id) IS NOT 'draft'
BEGIN SELECT RAISE(ABORT, 'order lines can only be removed while the order is a draft'); END;
--> statement-breakpoint
-- Stock can never go negative, whatever the code does.
CREATE TRIGGER `furniture_products_stock_non_negative` BEFORE UPDATE OF stock_quantity ON `furniture_products`
WHEN NEW.stock_quantity < 0
BEGIN SELECT RAISE(ABORT, 'stock cannot go below zero'); END;

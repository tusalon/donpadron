CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text NOT NULL,
	`price_each_cup` integer NOT NULL,
	`subtotal_cup` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0),
	CONSTRAINT "order_items_price_nonnegative" CHECK("order_items"."price_each_cup" >= 0),
	CONSTRAINT "order_items_subtotal_nonnegative" CHECK("order_items"."subtotal_cup" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order_id` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`display_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`delivery_method` text NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`payment_method` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`total_cup` integer NOT NULL,
	`status` text DEFAULT 'pendiente' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "orders_total_nonnegative" CHECK("orders"."total_cup" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_display_id_unique` ON `orders` (`display_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_status_created` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`price_cup` integer NOT NULL,
	`stock` real DEFAULT 0 NOT NULL,
	`minimum_step` real DEFAULT 1 NOT NULL,
	`emoji` text DEFAULT '🥩' NOT NULL,
	`accent` text DEFAULT '#d92525' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "products_price_nonnegative" CHECK("products"."price_cup" >= 0),
	CONSTRAINT "products_stock_nonnegative" CHECK("products"."stock" >= 0),
	CONSTRAINT "products_step_positive" CHECK("products"."minimum_step" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_products_active_category` ON `products` (`active`,`category`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`whatsapp_phone` text DEFAULT '' NOT NULL,
	`pickup_address` text DEFAULT '' NOT NULL,
	`payment_copy` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

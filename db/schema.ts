import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    unit: text("unit").notNull(),
    priceCup: integer("price_cup").notNull(),
    stock: real("stock").notNull().default(0),
    minimumStep: real("minimum_step").notNull().default(1),
    emoji: text("emoji").notNull().default("🥩"),
    accent: text("accent").notNull().default("#d92525"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_products_active_category").on(table.active, table.category),
    check("products_price_nonnegative", sql`${table.priceCup} >= 0`),
    check("products_stock_nonnegative", sql`${table.stock} >= 0`),
    check("products_step_positive", sql`${table.minimumStep} > 0`),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    displayId: text("display_id").notNull().unique(),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    deliveryMethod: text("delivery_method").notNull(),
    address: text("address").notNull().default(""),
    paymentMethod: text("payment_method").notNull(),
    notes: text("notes").notNull().default(""),
    totalCup: integer("total_cup").notNull(),
    status: text("status").notNull().default("pendiente"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_orders_status_created").on(table.status, table.createdAt),
    check("orders_total_nonnegative", sql`${table.totalCup} >= 0`),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull().references(() => products.id),
    productName: text("product_name").notNull(),
    quantity: real("quantity").notNull(),
    unit: text("unit").notNull(),
    priceEachCup: integer("price_each_cup").notNull(),
    subtotalCup: integer("subtotal_cup").notNull(),
  },
  (table) => [
    index("idx_order_items_order_id").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_price_nonnegative", sql`${table.priceEachCup} >= 0`),
    check("order_items_subtotal_nonnegative", sql`${table.subtotalCup} >= 0`),
  ],
);

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  businessName: text("business_name").notNull(),
  whatsappPhone: text("whatsapp_phone").notNull().default(""),
  pickupAddress: text("pickup_address").notNull().default(""),
  paymentCopy: text("payment_copy").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

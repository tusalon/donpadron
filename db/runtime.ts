import { env } from "cloudflare:workers";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    price_cup INTEGER NOT NULL CHECK (price_cup >= 0),
    stock REAL NOT NULL DEFAULT 0 CHECK (stock >= 0),
    minimum_step REAL NOT NULL DEFAULT 1 CHECK (minimum_step > 0),
    emoji TEXT NOT NULL DEFAULT '🥩',
    accent TEXT NOT NULL DEFAULT '#d92525',
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    display_id TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    delivery_method TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    total_cup INTEGER NOT NULL CHECK (total_cup >= 0),
    status TEXT NOT NULL DEFAULT 'pendiente',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    price_each_cup INTEGER NOT NULL CHECK (price_each_cup >= 0),
    subtotal_cup INTEGER NOT NULL CHECK (subtotal_cup >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    business_name TEXT NOT NULL,
    whatsapp_phone TEXT NOT NULL DEFAULT '',
    pickup_address TEXT NOT NULL DEFAULT '',
    payment_copy TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_products_active_category ON products(active, category)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
] as const;

const demoProducts = [
  ["chorizo-criollo", "Chorizo criollo", "Sazonado en casa, jugoso y listo para la sartén.", "Embutidos", "paquete de 500 g", 680, 18, 1, "🌭", "#ef3d30"],
  ["hamburguesas-caseras", "Hamburguesas caseras", "Cuatro unidades de cerdo condimentadas y listas para cocinar.", "Listos para cocinar", "paquete de 4", 850, 12, 1, "🍔", "#f08a24"],
  ["picadillo-condimentado", "Picadillo condimentado", "Mezcla fresca con el punto justo de especias.", "Preparados", "paquete de 1 kg", 1150, 9, 1, "🥩", "#bb2030"],
  ["jamon-prensado", "Jamón prensado", "Suave, rendidor y perfecto para panes y meriendas.", "Embutidos", "paquete de 500 g", 720, 6, 1, "🍖", "#d95e38"],
  ["croquetas-jamon", "Croquetas de jamón", "Crujientes por fuera, cremosas por dentro.", "Listos para cocinar", "paquete de 10", 550, 20, 1, "🟠", "#e0a124"],
  ["albondigas-criollas", "Albóndigas criollas", "Preparadas a mano para resolver una comida completa.", "Preparados", "paquete de 12", 780, 0, 1, "🍲", "#8f2834"],
] as const;

let initialization: Promise<D1Database> | null = null;

export function getD1(): Promise<D1Database> {
  if (!env.DB) {
    throw new Error("La base de datos de Don Padrón no está disponible.");
  }

  if (!initialization) {
    initialization = initialize(env.DB);
  }

  return initialization;
}

async function initialize(db: D1Database): Promise<D1Database> {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));

  const seedStatements = demoProducts.map((product) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO products
          (id, name, description, category, unit, price_cup, stock, minimum_step, emoji, accent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(...product),
  );

  seedStatements.push(
    db
      .prepare(
        `INSERT OR IGNORE INTO settings
          (id, business_name, whatsapp_phone, pickup_address, payment_copy)
         VALUES ('main', 'Don Padrón', '', 'Punto de elaboración Don Padrón',
           'Paga por Transfermóvil o en efectivo. Los datos exactos se confirman por WhatsApp.')`,
      ),
  );

  await db.batch(seedStatements);
  await db.prepare("PRAGMA optimize").run();
  return db;
}

export function databaseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Error inesperado";
  if (message.includes("D1") || message.includes("binding")) {
    return "No pudimos consultar la disponibilidad ahora mismo. Intenta nuevamente.";
  }
  return message;
}

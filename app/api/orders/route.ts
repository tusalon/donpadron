import { databaseErrorMessage, getD1 } from "../../../db/runtime";

type OrderPayload = {
  customerName?: string;
  phone?: string;
  deliveryMethod?: string;
  address?: string;
  paymentMethod?: string;
  notes?: string;
  items?: Array<{ productId?: string; quantity?: number }>;
};

type ProductRow = {
  id: string;
  name: string;
  unit: string;
  priceCup: number;
  stock: number;
  minimumStep: number;
  active: number;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as OrderPayload;
    const customerName = payload.customerName?.trim() ?? "";
    const phone = payload.phone?.trim() ?? "";
    const deliveryMethod = payload.deliveryMethod?.trim() ?? "recoger";
    const paymentMethod = payload.paymentMethod?.trim() ?? "efectivo";
    const address = payload.address?.trim() ?? "";
    const notes = payload.notes?.trim().slice(0, 300) ?? "";
    const items = (payload.items ?? [])
      .map((item) => ({
        productId: item.productId?.trim() ?? "",
        quantity: Number(item.quantity),
      }))
      .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);

    if (!customerName || phone.replace(/\D/g, "").length < 8) {
      return Response.json(
        { error: "Escribe tu nombre y un teléfono válido." },
        { status: 400 },
      );
    }

    if (!items.length || items.length > 20) {
      return Response.json(
        { error: "Añade al menos un producto al pedido." },
        { status: 400 },
      );
    }

    if (deliveryMethod === "domicilio" && !address) {
      return Response.json(
        { error: "Escribe la dirección de entrega." },
        { status: 400 },
      );
    }

    const db = await getD1();
    const placeholders = items.map(() => "?").join(", ");
    const productResult = await db
      .prepare(
        `SELECT id, name, unit, price_cup AS priceCup, stock,
                minimum_step AS minimumStep, active
         FROM products WHERE id IN (${placeholders})`,
      )
      .bind(...items.map((item) => item.productId))
      .all<ProductRow>();
    const products = new Map(productResult.results.map((product) => [product.id, product]));

    const orderLines = items.map((item) => {
      const product = products.get(item.productId);
      if (!product || !product.active) {
        throw new OrderValidationError("Uno de los productos ya no está disponible.");
      }
      if (item.quantity > product.stock) {
        throw new OrderValidationError(`Solo quedan ${product.stock} de ${product.name}.`);
      }
      const multiple = item.quantity / product.minimumStep;
      if (Math.abs(multiple - Math.round(multiple)) > 0.0001) {
        throw new OrderValidationError(`Revisa la cantidad de ${product.name}.`);
      }
      return {
        ...item,
        product,
        subtotalCup: Math.round(product.priceCup * item.quantity),
      };
    });

    const totalCup = orderLines.reduce((sum, item) => sum + item.subtotalCup, 0);
    const id = crypto.randomUUID();
    const displayId = `DP-${id.slice(0, 6).toUpperCase()}`;
    const statements = [
      db
        .prepare(
          `INSERT INTO orders
            (id, display_id, customer_name, phone, delivery_method, address,
             payment_method, notes, total_cup)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          displayId,
          customerName,
          phone,
          deliveryMethod,
          address,
          paymentMethod,
          notes,
          totalCup,
        ),
    ];

    for (const line of orderLines) {
      statements.push(
        db
          .prepare(
            `INSERT INTO order_items
              (order_id, product_id, product_name, quantity, unit, price_each_cup, subtotal_cup)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            line.product.id,
            line.product.name,
            line.quantity,
            line.product.unit,
            line.product.priceCup,
            line.subtotalCup,
          ),
      );
      statements.push(
        db
          .prepare(
            `UPDATE products
             SET stock = CASE WHEN active = 1 THEN stock - ? ELSE -1 END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          )
          .bind(line.quantity, line.product.id),
      );
    }

    await db.batch(statements);
    const settings = await db
      .prepare(
        `SELECT whatsapp_phone AS whatsappPhone, pickup_address AS pickupAddress,
                payment_copy AS paymentCopy
         FROM settings WHERE id = 'main'`,
      )
      .first<{ whatsappPhone: string; pickupAddress: string; paymentCopy: string }>();

    const message = [
      `Hola, quiero confirmar mi pedido ${displayId}.`,
      "",
      ...orderLines.map(
        (line) =>
          `• ${formatQuantity(line.quantity)} × ${line.product.name} — ${formatCup(line.subtotalCup)}`,
      ),
      "",
      `Total: ${formatCup(totalCup)}`,
      `Cliente: ${customerName}`,
      `Teléfono: ${phone}`,
      `Entrega: ${deliveryMethod === "domicilio" ? `Domicilio — ${address}` : `Recoger en ${settings?.pickupAddress ?? "el punto"}`}`,
      `Pago: ${paymentMethod}`,
      settings?.paymentCopy ? `Indicaciones de pago: ${settings.paymentCopy}` : "",
      notes ? `Nota: ${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const whatsappPhone = settings?.whatsappPhone?.replace(/\D/g, "") ?? "";
    const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;

    return Response.json(
      { order: { id, displayId, totalCup }, whatsappUrl },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    const message = databaseErrorMessage(error);
    const status = message.includes("CHECK constraint") ? 409 : 500;
    return Response.json(
      {
        error:
          status === 409
            ? "La disponibilidad cambió mientras hacías el pedido. Revisa el carrito."
            : message,
      },
      { status },
    );
  }
}

class OrderValidationError extends Error {}

function formatCup(value: number) {
  return `${new Intl.NumberFormat("es-CU").format(value)} CUP`;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

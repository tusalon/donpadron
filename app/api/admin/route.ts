import { isAdminRequest } from "../../admin-auth";
import { databaseErrorMessage, getD1 } from "../../../db/runtime";

type AdminAction =
  | {
      type?: "product";
      productId?: string;
      stock?: number;
      priceCup?: number;
      active?: boolean;
    }
  | { type?: "order"; orderId?: string; status?: string }
  | {
      type?: "settings";
      businessName?: string;
      whatsappPhone?: string;
      pickupAddress?: string;
      paymentCopy?: string;
    };

const allowedStatuses = new Set([
  "pendiente",
  "confirmado",
  "pagado",
  "listo",
  "completado",
  "cancelado",
]);

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest())) {
    return Response.json({ error: "Acceso no autorizado." }, { status: 401 });
  }

  try {
    const db = await getD1();
    const [productsResult, ordersResult, itemsResult, settingsResult] = await db.batch([
      db.prepare(
        `SELECT id, name, category, unit, price_cup AS priceCup, stock,
                minimum_step AS minimumStep, emoji, active
         FROM products ORDER BY category, name`,
      ),
      db.prepare(
        `SELECT id, display_id AS displayId, customer_name AS customerName,
                phone, delivery_method AS deliveryMethod, address,
                payment_method AS paymentMethod, notes, total_cup AS totalCup,
                status, created_at AS createdAt
         FROM orders ORDER BY created_at DESC LIMIT 80`,
      ),
      db.prepare(
        `SELECT id, order_id AS orderId, product_id AS productId,
                product_name AS productName, quantity, unit,
                price_each_cup AS priceEachCup, subtotal_cup AS subtotalCup
         FROM order_items
         WHERE order_id IN (SELECT id FROM orders ORDER BY created_at DESC LIMIT 80)
         ORDER BY id`,
      ),
      db.prepare(
        `SELECT business_name AS businessName, whatsapp_phone AS whatsappPhone,
                pickup_address AS pickupAddress, payment_copy AS paymentCopy
         FROM settings WHERE id = 'main'`,
      ),
    ]);

    const itemsByOrder = new Map<string, unknown[]>();
    for (const item of itemsResult.results as Array<{ orderId: string }>) {
      const current = itemsByOrder.get(item.orderId) ?? [];
      current.push(item);
      itemsByOrder.set(item.orderId, current);
    }

    return Response.json({
      products: productsResult.results,
      orders: (ordersResult.results as Array<{ id: string }>).map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      })),
      settings: settingsResult.results[0],
    });
  } catch (error) {
    return Response.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminRequest())) {
    return Response.json({ error: "Acceso no autorizado." }, { status: 401 });
  }

  try {
    const action = (await request.json()) as AdminAction;
    const db = await getD1();

    if (action.type === "product") {
      const productId = action.productId?.trim() ?? "";
      const stock = Number(action.stock);
      const priceCup = Number(action.priceCup);
      if (!productId || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(priceCup) || priceCup < 0) {
        return Response.json({ error: "Revisa el precio y la existencia." }, { status: 400 });
      }

      await db
        .prepare(
          `UPDATE products
           SET stock = ?, price_cup = ?, active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(stock, Math.round(priceCup), action.active === false ? 0 : 1, productId)
        .run();
      return Response.json({ ok: true });
    }

    if (action.type === "order") {
      const orderId = action.orderId?.trim() ?? "";
      const status = action.status?.trim() ?? "";
      if (!orderId || !allowedStatuses.has(status)) {
        return Response.json({ error: "Estado de pedido inválido." }, { status: 400 });
      }

      const order = await db
        .prepare("SELECT status FROM orders WHERE id = ?")
        .bind(orderId)
        .first<{ status: string }>();
      if (!order) {
        return Response.json({ error: "Pedido no encontrado." }, { status: 404 });
      }
      if (order.status === "cancelado" && status !== "cancelado") {
        return Response.json(
          { error: "Un pedido cancelado no puede reabrirse automáticamente." },
          { status: 409 },
        );
      }

      if (status === "cancelado" && order.status !== "cancelado") {
        const items = await db
          .prepare("SELECT product_id AS productId, quantity FROM order_items WHERE order_id = ?")
          .bind(orderId)
          .all<{ productId: string; quantity: number }>();
        await db.batch([
          ...items.results.map((item) =>
            db
              .prepare(
                "UPDATE products SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
              )
              .bind(item.quantity, item.productId),
          ),
          db
            .prepare(
              "UPDATE orders SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(orderId),
        ]);
      } else {
        await db
          .prepare("UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(status, orderId)
          .run();
      }

      return Response.json({ ok: true });
    }

    if (action.type === "settings") {
      const businessName = action.businessName?.trim() ?? "";
      const whatsappPhone = action.whatsappPhone?.replace(/\D/g, "") ?? "";
      const pickupAddress = action.pickupAddress?.trim() ?? "";
      const paymentCopy = action.paymentCopy?.trim() ?? "";
      if (!businessName || !pickupAddress || !paymentCopy) {
        return Response.json({ error: "Completa los datos del negocio." }, { status: 400 });
      }
      if (whatsappPhone && whatsappPhone.length < 10) {
        return Response.json(
          { error: "Escribe el número de WhatsApp con código de país. Ejemplo: 5351234567." },
          { status: 400 },
        );
      }
      await db
        .prepare(
          `UPDATE settings
           SET business_name = ?, whatsapp_phone = ?, pickup_address = ?,
               payment_copy = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = 'main'`,
        )
        .bind(businessName, whatsappPhone, pickupAddress, paymentCopy)
        .run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

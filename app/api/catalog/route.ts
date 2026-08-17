import { databaseErrorMessage, getD1 } from "../../../db/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getD1();
    const [productsResult, settingsResult] = await db.batch([
      db.prepare(
        `SELECT id, name, description, category, unit,
                price_cup AS priceCup, stock, minimum_step AS minimumStep,
                emoji, accent
         FROM products
         WHERE active = 1
         ORDER BY category, name`,
      ),
      db.prepare(
        `SELECT business_name AS businessName, whatsapp_phone AS whatsappPhone,
                pickup_address AS pickupAddress, payment_copy AS paymentCopy
         FROM settings WHERE id = 'main'`,
      ),
    ]);

    return Response.json({
      products: productsResult.results,
      settings: settingsResult.results[0],
    });
  } catch (error) {
    return Response.json({ error: databaseErrorMessage(error) }, { status: 500 });
  }
}

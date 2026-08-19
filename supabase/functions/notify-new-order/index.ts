import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails("mailto:soporte@donpadron.local", vapidPublicKey, vapidPrivateKey);
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "Faltan las claves VAPID en los secretos de la funcion." }, 500);
  }

  let displayId = "";
  let totalCup = 0;
  let isTest = false;
  try {
    const body = await req.json();
    displayId = String(body.displayId ?? "").slice(0, 40);
    totalCup = Number(body.totalCup) || 0;
    isTest = body.test === true;
  } catch {
    // Cuerpo vacío o inválido: se envía la notificación genérica igual.
  }

  const { data, error } = await supabase.rpc("push_list_subscriptions");
  if (error) {
    return json({ error: `No pudimos leer las suscripciones: ${error.message}` }, 500);
  }

  const subscriptions = (data ?? []) as Subscription[];
  if (subscriptions.length === 0) {
    return json({ sent: 0, failed: 0, errors: ["No hay dispositivos suscritos."] });
  }

  const payload = JSON.stringify(
    isTest
      ? { title: "Prueba de Don Padrón", body: "Si ves esto, las notificaciones funcionan." }
      : {
          title: "Nuevo pedido en Don Padrón",
          body: displayId ? `Pedido ${displayId} · ${totalCup} CUP` : "Entró un pedido nuevo. Revisa el panel.",
        },
  );

  const staleIds: string[] = [];
  const errors: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent += 1;
      } catch (caught) {
        const statusCode = (caught as { statusCode?: number })?.statusCode;
        const detail = (caught as { body?: string })?.body ?? (caught as Error)?.message ?? String(caught);
        // 404/410: el navegador desecho la suscripcion, se limpia sola.
        if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
        errors.push(statusCode ? `${statusCode}: ${detail}` : detail);
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabase.rpc("push_delete_subscriptions", { p_ids: staleIds });
  }

  return json({ sent, failed: errors.length, errors });
});

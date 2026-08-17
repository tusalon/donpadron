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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: "Notificaciones no configuradas." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let displayId = "";
  let totalCup = 0;
  try {
    const body = await req.json();
    displayId = String(body.displayId ?? "").slice(0, 40);
    totalCup = Number(body.totalCup) || 0;
  } catch {
    // Cuerpo vacío o inválido: se envía la notificación genérica igual.
  }

  const { data: subscriptions, error } = await supabase
    .schema("private")
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = JSON.stringify({
    title: "Nuevo pedido en Don Padrón",
    body: displayId ? `Pedido ${displayId} · ${totalCup} CUP` : "Entró un pedido nuevo. Revisa el panel.",
  });

  const staleIds: string[] = [];

  await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (caught) {
        const statusCode = (caught as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabase.schema("private").from("push_subscriptions").delete().in("id", staleIds);
  }

  return new Response(JSON.stringify({ sent: (subscriptions ?? []).length - staleIds.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

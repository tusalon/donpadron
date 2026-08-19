import { useCallback, useEffect, useState } from "react";
import { getOrderStatus, type TrackedOrder } from "../lib/api";

const steps = [
  { key: "pendiente", label: "Recibido", hint: "Estamos revisando tu pedido." },
  { key: "confirmado", label: "Confirmado", hint: "Ya lo estamos preparando." },
  { key: "pagado", label: "Pagado", hint: "Recibimos tu pago." },
  { key: "listo", label: "Listo", hint: "Tu pedido está listo." },
  { key: "completado", label: "Entregado", hint: "¡Gracias por tu compra!" },
];

export default function OrderTracker({ orderId }: { orderId: string }) {
  const logoUrl = `${import.meta.env.BASE_URL}don-padron-icon.png`;
  const storeHref = import.meta.env.BASE_URL;
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setOrder(await getOrderStatus(orderId));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar el pedido.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // El estado lo cambia el negocio desde su panel, asi que se revisa cada
    // tanto. Solo con la pestaña visible, para no gastar datos en segundo plano.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const cancelled = order?.status === "cancelado";
  const currentStep = steps.findIndex((step) => step.key === order?.status);

  return (
    <div className="storefront">
      <header className="site-header">
        <div className="site-header__inner">
          <a href={storeHref} className="brand-lockup" aria-label="Ir a la tienda">
            <img src={logoUrl} alt="" />
            <span>
              <strong>{order?.business.name ?? "Don Padrón"}</strong>
              <small>Seguimiento de pedido</small>
            </span>
          </a>
        </div>
      </header>

      <main className="tracker">
        {loading ? (
          <div className="admin-loading">Buscando tu pedido…</div>
        ) : error ? (
          <div className="empty-panel">
            <strong>No encontramos ese pedido.</strong>
            <span>{error} Revisa el enlace que te enviaron.</span>
          </div>
        ) : order ? (
          <>
            <section className="tracker-head">
              <p className="eyebrow">Pedido de {order.customerName}</p>
              <h1>{order.displayId}</h1>
              <div className="tracker-total"><span>Total</span><strong>{formatCup(order.totalCup)}</strong></div>
            </section>

            {cancelled ? (
              <div className="tracker-cancelled" role="status">
                <strong>Este pedido fue cancelado.</strong>
                <span>Si crees que es un error, escríbenos por WhatsApp.</span>
              </div>
            ) : (
              <ol className="tracker-steps" aria-label="Estado del pedido">
                {steps.map((step, index) => (
                  <li key={step.key} className={index < currentStep ? "is-done" : index === currentStep ? "is-current" : ""}>
                    <span className="tracker-steps__dot" aria-hidden="true">{index < currentStep ? "✓" : index + 1}</span>
                    <div>
                      <strong>{step.label}</strong>
                      {index === currentStep && <small>{step.hint}</small>}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <section className="tracker-card">
              <p className="eyebrow">Lo que pediste</p>
              <ul className="tracker-items">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span>{formatQuantity(item.quantity)} × {item.productName}</span>
                    <b>{formatCup(item.subtotalCup)}</b>
                  </li>
                ))}
              </ul>
              <p className="tracker-delivery">
                {order.deliveryMethod === "domicilio"
                  ? `Entrega a domicilio: ${order.address}`
                  : `Recoges en: ${order.business.pickupAddress || "el punto de elaboración"}`}
                {" · "}Pago: {order.paymentMethod}
              </p>
            </section>

            <a
              className="button button--whatsapp button--full"
              href={`https://wa.me/${order.business.whatsappPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hola, escribo por mi pedido ${order.displayId}.`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Escribir por WhatsApp <span>W</span>
            </a>
            <p className="tracker-note">Esta página se actualiza sola. Guárdala para seguir tu pedido.</p>
          </>
        ) : null}
      </main>
    </div>
  );
}

function formatCup(value: number) {
  return `${new Intl.NumberFormat("es-CU").format(Math.round(value))} CUP`;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

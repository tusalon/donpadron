import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminDashboard,
  updateAdminOrder,
  updateAdminProduct,
  updateAdminSettings,
  type AdminOrder,
  type AdminProduct,
  type StoreSettings,
} from "../lib/api";

const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  pagado: "Pagado",
  listo: "Listo para entregar",
  completado: "Completado",
  cancelado: "Cancelado",
};

type AdminClientProps = {
  token: string;
  onLogout: () => void;
  onSessionExpired: () => void;
};

export default function AdminClient({ token, onLogout, onSessionExpired }: AdminClientProps) {
  const logoUrl = `${import.meta.env.BASE_URL}don-padron-icon.png`;
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ businessName: "Don Padrón", whatsappPhone: "", pickupAddress: "", paymentCopy: "" });
  const [tab, setTab] = useState<"orders" | "inventory" | "settings">("orders");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getAdminDashboard(token);
      setProducts(data.products ?? []);
      setOrders(data.orders ?? []);
      if (data.settings) setSettings(data.settings);
      setError("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No pudimos cargar el panel.";
      if (message.startsWith("La sesión administrativa")) onSessionExpired();
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired, token]);

  useEffect(() => {
    // La carga inicial sincroniza la interfaz con la base remota.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((order) => order.createdAt.slice(0, 10) === today);
    return {
      pending: orders.filter((order) => order.status === "pendiente").length,
      todayTotal: todayOrders
        .filter((order) => order.status !== "cancelado")
        .reduce((sum, order) => sum + order.totalCup, 0),
      lowStock: products.filter((product) => product.active && product.stock <= 5).length,
    };
  }, [orders, products]);

  async function updateProduct(product: AdminProduct, changes: Partial<AdminProduct>) {
    const next = { ...product, ...changes };
    setBusy(product.id);
    try {
      await updateAdminProduct(token, {
        id: product.id,
        stock: next.stock,
        priceCup: next.priceCup,
        active: next.active,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos guardar el producto.");
    } finally {
      setBusy("");
    }
  }

  async function updateOrder(order: AdminOrder, status: string) {
    setBusy(order.id);
    try {
      await updateAdminOrder(token, order.id, status);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos actualizar el pedido.");
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("settings");
    try {
      await updateAdminSettings(token, settings);
      setError("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos guardar los datos.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a href="#inicio" className="brand-lockup brand-lockup--small">
          <img src={logoUrl} alt="" />
          <span>
            <strong>Don Padrón</strong>
            <small>Panel del negocio</small>
          </span>
        </a>
        <div className="admin-user">
          <span>Administración</span>
          <button type="button" onClick={onLogout}>Salir</button>
        </div>
      </header>

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Control de hoy</p>
          <h1>Pedidos claros. Almacén al día.</h1>
        </div>
        <a href="#inicio" className="button button--light">Ver tienda</a>
      </section>

      <section className="metric-grid" aria-label="Resumen del negocio">
        <article><span>Por confirmar</span><strong>{metrics.pending}</strong><small>pedidos</small></article>
        <article><span>Venta de hoy</span><strong>{formatCup(metrics.todayTotal)}</strong><small>sin cancelados</small></article>
        <article><span>Stock bajo</span><strong>{metrics.lowStock}</strong><small>productos</small></article>
      </section>

      <nav className="admin-tabs" aria-label="Secciones del panel">
        <button className={tab === "orders" ? "is-active" : ""} onClick={() => setTab("orders")}>Pedidos</button>
        <button className={tab === "inventory" ? "is-active" : ""} onClick={() => setTab("inventory")}>Inventario</button>
        <button className={tab === "settings" ? "is-active" : ""} onClick={() => setTab("settings")}>Ajustes</button>
      </nav>

      {error && <div className="form-error" role="alert">{error}</div>}
      {loading ? (
        <div className="admin-loading">Organizando la información…</div>
      ) : tab === "orders" ? (
        <section className="order-list" aria-label="Pedidos recientes">
          {orders.length === 0 ? (
            <div className="empty-panel"><strong>Todavía no hay pedidos.</strong><span>Cuando un cliente compre, aparecerá aquí.</span></div>
          ) : orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-card__head">
                <div><span className={`status status--${order.status}`}>{statusLabels[order.status]}</span><h2>{order.displayId}</h2></div>
                <div className="order-total">{formatCup(order.totalCup)}<small>{formatDate(order.createdAt)}</small></div>
              </div>
              <div className="order-customer"><strong>{order.customerName}</strong><a href={`tel:${order.phone}`}>{order.phone}</a><span>{order.deliveryMethod === "domicilio" ? `Domicilio · ${order.address}` : "Recoge en el punto"}</span></div>
              <ul>{order.items.map((item) => <li key={item.id}><span>{formatQuantity(item.quantity)} × {item.productName}</span><strong>{formatCup(item.subtotalCup)}</strong></li>)}</ul>
              <div className="order-actions">
                {order.status === "pendiente" && <button disabled={busy === order.id} onClick={() => updateOrder(order, "confirmado")}>Confirmar</button>}
                {["confirmado", "pendiente"].includes(order.status) && <button disabled={busy === order.id} onClick={() => updateOrder(order, "pagado")}>Marcar pagado</button>}
                {["confirmado", "pagado"].includes(order.status) && <button disabled={busy === order.id} onClick={() => updateOrder(order, "listo")}>Está listo</button>}
                {order.status === "listo" && <button disabled={busy === order.id} onClick={() => updateOrder(order, "completado")}>Entregado</button>}
                {!['cancelado', 'completado'].includes(order.status) && <button className="button-link-danger" disabled={busy === order.id} onClick={() => updateOrder(order, "cancelado")}>Cancelar y devolver stock</button>}
              </div>
            </article>
          ))}
        </section>
      ) : tab === "inventory" ? (
        <section className="inventory-list" aria-label="Inventario">
          {products.map((product) => (
            <article className="inventory-row" key={product.id}>
              <div className="inventory-product"><span>{product.emoji}</span><div><strong>{product.name}</strong><small>{product.unit} · {formatCup(product.priceCup)}</small></div></div>
              <div className="stock-control" aria-label={`Existencia de ${product.name}`}>
                <button disabled={busy === product.id || product.stock <= 0} onClick={() => updateProduct(product, { stock: Math.max(0, product.stock - product.minimumStep) })} aria-label="Restar existencia">−</button>
                <strong>{formatQuantity(product.stock)}</strong>
                <button disabled={busy === product.id} onClick={() => updateProduct(product, { stock: product.stock + product.minimumStep })} aria-label="Sumar existencia">+</button>
              </div>
              <label className="price-control"><span>Precio CUP</span><input type="number" min="0" step="1" defaultValue={product.priceCup} disabled={busy === product.id} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value !== product.priceCup) void updateProduct(product, { priceCup: value }); }} /></label>
              <button className={`availability-toggle ${product.active ? "is-on" : ""}`} disabled={busy === product.id} onClick={() => updateProduct(product, { active: !product.active })}>{product.active ? "Visible" : "Oculto"}</button>
            </article>
          ))}
          <p className="inventory-note">Cada pedido nuevo rebaja estas existencias. Si cancelas, las unidades regresan automáticamente.</p>
        </section>
      ) : (
        <form className="settings-panel" onSubmit={saveSettings}>
          <div className="settings-panel__intro"><p className="eyebrow">Datos que verá el cliente</p><h2>Información del punto</h2><p>Configura el teléfono de WhatsApp, la recogida y cómo se paga.</p></div>
          <div className="settings-fields">
            <label><span>Nombre del negocio</span><input required value={settings.businessName} onChange={(event) => setSettings({ ...settings, businessName: event.target.value })} /></label>
            <label><span>WhatsApp con código de país</span><input value={settings.whatsappPhone} onChange={(event) => setSettings({ ...settings, whatsappPhone: event.target.value })} inputMode="tel" placeholder="Ej. 5351234567" /><small>Si lo dejas vacío, WhatsApp permitirá elegir el contacto.</small></label>
            <label><span>Dirección para recoger</span><textarea required value={settings.pickupAddress} onChange={(event) => setSettings({ ...settings, pickupAddress: event.target.value })} /></label>
            <label><span>Información de pago</span><textarea required value={settings.paymentCopy} onChange={(event) => setSettings({ ...settings, paymentCopy: event.target.value })} placeholder="Explica las formas de pago y cuándo se comparten los datos." /></label>
          </div>
          <button className="button button--primary" type="submit" disabled={busy === "settings"}>{busy === "settings" ? "Guardando…" : "Guardar datos"}</button>
        </form>
      )}
    </main>
  );
}

function formatCup(value: number) {
  return `${new Intl.NumberFormat("es-CU").format(value)} CUP`;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-CU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(`${value.replace(" ", "T")}Z`));
}

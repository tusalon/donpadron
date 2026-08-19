import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminDashboard,
  getCustomerDetail,
  saveAdminProduct,
  saveAdminPushSubscription,
  sendTestPushNotification,
  setCustomerStatus,
  updateAdminOrder,
  updateAdminProduct,
  updateAdminSettings,
  uploadProductPhoto,
  type AdminOrder,
  type AdminProduct,
  type Customer,
  type CustomerDetail,
  type CustomerStatus,
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

const customerStatusLabels: Record<string, string> = {
  pendiente: "Por aceptar",
  aceptado: "Cliente",
  rechazado: "Rechazado",
};

const emptyProduct: AdminProduct = {
  id: "",
  name: "",
  description: "",
  category: "Preparados",
  unit: "paquete",
  priceCup: 0,
  stock: 0,
  minimumStep: 1,
  emoji: "🥩",
  accent: "#d92525",
  photoUrl: "",
  active: true,
};

type AdminClientProps = {
  token: string;
  onLogout: () => void;
  onSessionExpired: () => void;
};

export default function AdminClient({ token, onLogout, onSessionExpired }: AdminClientProps) {
  const logoUrl = `${import.meta.env.BASE_URL}don-padron-icon.png`;
  const storeUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<StoreSettings>({ businessName: "Don Padrón", whatsappPhone: "", pickupAddress: "", paymentCopy: "" });
  const [tab, setTab] = useState<"orders" | "inventory" | "customers" | "settings">("orders");
  const [openCustomer, setOpenCustomer] = useState<Customer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [productDraft, setProductDraft] = useState<AdminProduct | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pushState, setPushState] = useState<"checking" | "unsupported" | "denied" | "off" | "on" | "busy">("checking");
  const [pushStep, setPushStep] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [pushTest, setPushTest] = useState("");
  const [notifyOrder, setNotifyOrder] = useState<{ id: string; status: string } | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPushState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!subscription) return "off" as const;
        // El navegador puede tener la suscripcion aunque el guardado anterior
        // fallara. El upsert es idempotente, asi que la reafirmamos siempre.
        await saveAdminPushSubscription(token, subscription.toJSON());
        return "on" as const;
      })
      .then(setPushState)
      .catch(() => setPushState("off"));
  }, [token]);

  async function testPushNotification() {
    setPushTest("Enviando…");
    setError("");
    try {
      const result = await sendTestPushNotification();
      setPushTest(
        result.sent > 0
          ? `Enviada a ${result.sent} dispositivo${result.sent === 1 ? "" : "s"}.`
          : `No se envió a nadie. ${result.errors.join(" ") || "No hay dispositivos suscritos."}`,
      );
    } catch (caught) {
      setPushTest(caught instanceof Error ? caught.message : "No pudimos enviar la prueba.");
    }
  }

  async function copyStoreLink() {
    try {
      await navigator.clipboard.writeText(storeUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("No pudimos copiar. Mantén pulsado el enlace para copiarlo a mano.");
    }
  }

  async function shareStoreLink() {
    const message = `${settings.businessName}: mira lo que hay hoy y deja tu pedido aquí 👉 ${storeUrl}`;
    if (!navigator.share) {
      await copyStoreLink();
      return;
    }
    try {
      await navigator.share({ title: settings.businessName, text: message, url: storeUrl });
    } catch {
      // El usuario cerró el menú de compartir: no hay nada que reportar.
    }
  }

  async function enablePushNotifications() {
    setPushState("busy");
    setError("");
    setPushStep("Pidiendo permiso");
    try {
      const permission = await withTimeout(Notification.requestPermission(), 60000, "Pidiendo permiso");
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "off");
        return;
      }
      const vapidKey = import.meta.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("Falta configurar la clave pública de notificaciones.");

      setPushStep("Preparando el servicio");
      const registration = await withTimeout(navigator.serviceWorker.ready, 20000, "Preparando el servicio");

      setPushStep("Creando la suscripción");
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await withTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          }),
          30000,
          "Creando la suscripción",
        ));

      setPushStep("Guardando en el servidor");
      await saveAdminPushSubscription(token, subscription.toJSON());
      setPushState("on");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos activar las notificaciones.");
      setPushState("off");
    } finally {
      setPushStep("");
    }
  }

  const load = useCallback(async () => {
    try {
      const data = await getAdminDashboard(token);
      setProducts(data.products ?? []);
      setOrders(data.orders ?? []);
      setCustomers(data.customers ?? []);
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

  const pendingCustomers = customers.filter((customer) => customer.status === "pendiente").length;

  async function changeCustomerStatus(customer: Customer, status: CustomerStatus) {
    setBusy(customer.id);
    try {
      await setCustomerStatus(token, customer.id, status);
      setCustomers((current) => current.map((item) => (item.id === customer.id ? { ...item, status } : item)));
      setOpenCustomer((current) => (current?.id === customer.id ? { ...current, status } : current));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos actualizar el cliente.");
    } finally {
      setBusy("");
    }
  }

  async function showCustomer(customer: Customer) {
    setOpenCustomer(customer);
    setCustomerDetail(null);
    try {
      setCustomerDetail(await getCustomerDetail(token, customer.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar la ficha del cliente.");
    }
  }

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

  function startNewProduct() {
    setError("");
    setCreatingProduct(true);
    setProductDraft(emptyProduct);
  }

  function startEditProduct(product: AdminProduct) {
    setError("");
    setCreatingProduct(false);
    setProductDraft({ ...product });
  }

  function updateProductDraft(changes: Partial<AdminProduct>) {
    setProductDraft((current) => current ? { ...current, ...changes } : current);
  }

  async function handleProductPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    setError("");
    try {
      const url = await uploadProductPhoto(file);
      updateProductDraft({ photoUrl: url });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos subir la imagen.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function saveProductEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!productDraft) return;

    const productId = productDraft.id || slugifyProductName(productDraft.name);
    const productToSave: AdminProduct = {
      ...productDraft,
      id: productId,
      priceCup: Math.round(Number(productDraft.priceCup)),
      stock: Number(productDraft.stock),
      minimumStep: Number(productDraft.minimumStep),
    };

    setBusy("product-editor");
    try {
      const saved = await saveAdminProduct(token, productToSave, creatingProduct);
      setProducts((current) => {
        const next = current.some((item) => item.id === saved.id)
          ? current.map((item) => (item.id === saved.id ? saved : item))
          : [...current, saved];
        return next.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
      });
      setProductDraft(null);
      setCreatingProduct(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos guardar el producto.");
    } finally {
      setBusy("");
    }
  }

  async function updateOrder(order: AdminOrder, status: string) {
    const question = status === "cancelado"
      ? `¿Cancelar el pedido ${order.displayId} de ${order.customerName}? Las existencias volverán al inventario.`
      : `¿Marcar el pedido ${order.displayId} de ${order.customerName} como "${statusLabels[status]}"?`;
    if (!window.confirm(question)) return;

    setBusy(order.id);
    try {
      await updateAdminOrder(token, order.id, status);
      setNotifyOrder({ id: order.id, status });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos actualizar el pedido.");
    } finally {
      setBusy("");
    }
  }

  // El aviso se manda con un toque explicito: abrir WhatsApp despues de un
  // await lo bloquean los navegadores y el mensaje se perderia en silencio.
  function customerWhatsappUrl(order: AdminOrder, status: string) {
    const trackUrl = `${storeUrl}#/pedido/${order.id}`;
    const pickup = settings.pickupAddress || "el punto de elaboración";
    const messages: Record<string, string> = {
      pendiente: `Hola ${order.customerName}, recibimos tu pedido ${order.displayId}.`,
      confirmado: `Hola ${order.customerName}, confirmamos tu pedido ${order.displayId}. Ya lo estamos preparando.`,
      pagado: `Hola ${order.customerName}, recibimos el pago de tu pedido ${order.displayId}. ¡Gracias!`,
      listo: order.deliveryMethod === "domicilio"
        ? `Hola ${order.customerName}, tu pedido ${order.displayId} está listo y sale para tu dirección.`
        : `Hola ${order.customerName}, tu pedido ${order.displayId} está listo. Puedes recogerlo en ${pickup}.`,
      completado: `Hola ${order.customerName}, gracias por tu compra. Esperamos verte pronto por ${settings.businessName}.`,
      cancelado: `Hola ${order.customerName}, tu pedido ${order.displayId} fue cancelado. Escríbenos si necesitas ayuda.`,
    };
    const text = `${messages[status] ?? messages.pendiente}\n\nSigue tu pedido aquí: ${trackUrl}`;
    return `https://wa.me/${order.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
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
        <button className={tab === "customers" ? "is-active" : ""} onClick={() => setTab("customers")}>
          Clientes{pendingCustomers > 0 && <b className="tab-badge">{pendingCustomers}</b>}
        </button>
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
              {notifyOrder?.id === order.id && (
                <a
                  className="notify-customer"
                  href={customerWhatsappUrl(order, notifyOrder.status)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setNotifyOrder(null)}
                >
                  Avisar a {order.customerName} por WhatsApp <span>W</span>
                </a>
              )}
            </article>
          ))}
        </section>
      ) : tab === "inventory" ? (
        <section className="inventory-list" aria-label="Inventario">
          <div className="inventory-toolbar">
            <div>
              <p className="eyebrow">Productos del negocio</p>
              <h2>Inventario</h2>
            </div>
            <button className="button button--primary" type="button" disabled={busy === "product-editor"} onClick={startNewProduct}>+ Nuevo producto</button>
          </div>

          {productDraft && (
            <form className="product-editor" onSubmit={saveProductEditor}>
              <div className="product-editor__head">
                <div>
                  <p className="eyebrow">{creatingProduct ? "Alta nueva" : "Editando producto"}</p>
                  <h3>{creatingProduct ? "Nuevo producto" : productDraft.name}</h3>
                </div>
                <button type="button" onClick={() => setProductDraft(null)}>Cerrar</button>
              </div>
              <div className="product-editor__fields">
                <div className="product-editor__wide product-editor__photo">
                  <span>Foto del producto</span>
                  {productDraft.photoUrl && <img src={productDraft.photoUrl} alt="" className="product-editor__photo-preview" />}
                  <input type="file" accept="image/*" onChange={handleProductPhoto} disabled={uploadingPhoto} />
                  {uploadingPhoto && <small>Subiendo…</small>}
                </div>
                <label><span>Nombre</span><input required value={productDraft.name} onChange={(event) => updateProductDraft({ name: event.target.value })} placeholder="Ej. Chorizo criollo" /></label>
                <label><span>Categoría</span><input required list="product-categories" value={productDraft.category} onChange={(event) => updateProductDraft({ category: event.target.value })} placeholder="Preparados" /></label>
                <label className="product-editor__wide"><span>Descripción</span><textarea value={productDraft.description} onChange={(event) => updateProductDraft({ description: event.target.value })} placeholder="Texto corto que verá el cliente." /></label>
                <label><span>Unidad</span><input required value={productDraft.unit} onChange={(event) => updateProductDraft({ unit: event.target.value })} placeholder="paquete de 500 g" /></label>
                <label><span>Precio CUP</span><input required type="number" min="0" step="1" value={productDraft.priceCup} onChange={(event) => updateProductDraft({ priceCup: Number(event.target.value) })} /></label>
                <label><span>Existencia</span><input required type="number" min="0" step="0.001" value={productDraft.stock} onChange={(event) => updateProductDraft({ stock: Number(event.target.value) })} /></label>
                <label><span>Paso de venta</span><input required type="number" min="0.001" step="0.001" value={productDraft.minimumStep} onChange={(event) => updateProductDraft({ minimumStep: Number(event.target.value) })} /></label>
                <label><span>Icono</span><input value={productDraft.emoji} onChange={(event) => updateProductDraft({ emoji: event.target.value })} maxLength={8} /></label>
                <label><span>Color</span><input type="color" value={productDraft.accent} onChange={(event) => updateProductDraft({ accent: event.target.value })} /></label>
                <label className="product-editor__check"><input type="checkbox" checked={productDraft.active} onChange={(event) => updateProductDraft({ active: event.target.checked })} /><span>Visible para clientes</span></label>
              </div>
              <div className="product-editor__actions">
                <button className="button button--primary" type="submit" disabled={busy === "product-editor" || uploadingPhoto}>{busy === "product-editor" ? "Guardando…" : "Guardar producto"}</button>
                <button className="text-button" type="button" onClick={() => setProductDraft(null)}>Cancelar</button>
              </div>
              <datalist id="product-categories">
                {Array.from(new Set(products.map((product) => product.category))).map((category) => <option value={category} key={category} />)}
              </datalist>
            </form>
          )}

          {products.map((product) => {
            const isEditingThisRow = productDraft !== null && productDraft.id === product.id;
            const rowDisabled = busy === product.id || busy === "product-editor" || isEditingThisRow;
            return (
            <article className="inventory-row" key={product.id}>
              <div className="inventory-product">
                {product.photoUrl ? (
                  <img src={product.photoUrl} alt="" className="inventory-product__photo" />
                ) : (
                  <span style={{ background: product.accent }}>{product.emoji}</span>
                )}
                <div><strong>{product.name}</strong><small>{product.category} · {product.unit} · {formatCup(product.priceCup)}</small></div>
              </div>
              <div className="stock-control" aria-label={`Existencia de ${product.name}`}>
                <button disabled={rowDisabled || product.stock <= 0} onClick={() => updateProduct(product, { stock: Math.max(0, product.stock - product.minimumStep) })} aria-label="Restar existencia">−</button>
                <strong>{formatQuantity(product.stock)}</strong>
                <button disabled={rowDisabled} onClick={() => updateProduct(product, { stock: product.stock + product.minimumStep })} aria-label="Sumar existencia">+</button>
              </div>
              <label className="price-control"><span>Precio CUP</span><input type="number" min="0" step="1" defaultValue={product.priceCup} disabled={rowDisabled} onBlur={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 0 && value !== product.priceCup) void updateProduct(product, { priceCup: value }); }} /></label>
              <button className="edit-product-button" type="button" disabled={rowDisabled} onClick={() => startEditProduct(product)}>Editar</button>
              <button className={`availability-toggle ${product.active ? "is-on" : ""}`} disabled={rowDisabled} onClick={() => updateProduct(product, { active: !product.active })}>{product.active ? "Visible" : "Oculto"}</button>
            </article>
            );
          })}
          <p className="inventory-note">Cada pedido nuevo rebaja estas existencias. Si cancelas, las unidades regresan automáticamente.</p>
        </section>
      ) : tab === "customers" ? (
        <section className="inventory-list" aria-label="Clientes">
          <div className="inventory-toolbar">
            <div>
              <p className="eyebrow">Cartera del negocio</p>
              <h2>Clientes</h2>
            </div>
            <span className="customer-count">{customers.length} en total</span>
          </div>

          {openCustomer && (
            <div className="product-editor">
              <div className="product-editor__head">
                <div>
                  <p className="eyebrow">{openCustomer.phone}</p>
                  <h3>{openCustomer.name}</h3>
                </div>
                <button type="button" onClick={() => setOpenCustomer(null)}>Cerrar</button>
              </div>
              <div className="customer-stats">
                <article><span>Pedidos</span><strong>{openCustomer.orderCount}</strong></article>
                <article><span>Total gastado</span><strong>{formatCup(openCustomer.totalSpentCup)}</strong></article>
                <article><span>Último pedido</span><strong>{openCustomer.lastOrderAt ? formatDate(openCustomer.lastOrderAt) : "Nunca"}</strong></article>
              </div>
              {!customerDetail ? (
                <p className="inventory-note">Cargando la ficha…</p>
              ) : (
                <>
                  <p className="eyebrow customer-section-title">Lo que más compra</p>
                  {customerDetail.topProducts.length === 0 ? (
                    <p className="inventory-note">Todavía no tiene compras registradas.</p>
                  ) : (
                    <ul className="customer-top-list">
                      {customerDetail.topProducts.map((item) => (
                        <li key={item.productName}>
                          <span>{item.productName}</span>
                          <b>{formatQuantity(item.quantity)} · {formatCup(item.totalCup)}</b>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="eyebrow customer-section-title">Sus pedidos</p>
                  {customerDetail.orders.length === 0 ? (
                    <p className="inventory-note">Sin pedidos.</p>
                  ) : (
                    <ul className="customer-top-list">
                      {customerDetail.orders.map((order) => (
                        <li key={order.id}>
                          <span>{order.displayId} · {formatDate(order.createdAt)}</span>
                          <b><span className={`status status--${order.status}`}>{statusLabels[order.status]}</span> {formatCup(order.totalCup)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {customers.length === 0 ? (
            <div className="empty-panel"><strong>Todavía no hay clientes.</strong><span>Aparecerán aquí en cuanto alguien haga su primer pedido.</span></div>
          ) : customers.map((customer) => (
            <article className={`customer-row ${customer.status === "pendiente" ? "is-pending" : ""}`} key={customer.id}>
              <button className="customer-identity" type="button" onClick={() => showCustomer(customer)}>
                <strong>{customer.name}</strong>
                <small>{customer.phone} · {customer.orderCount} pedido{customer.orderCount === 1 ? "" : "s"} · {formatCup(customer.totalSpentCup)}</small>
              </button>
              <span className={`customer-status customer-status--${customer.status}`}>{customerStatusLabels[customer.status]}</span>
              <div className="customer-actions">
                {customer.status !== "aceptado" && (
                  <button disabled={busy === customer.id} onClick={() => changeCustomerStatus(customer, "aceptado")}>Aceptar</button>
                )}
                {customer.status !== "rechazado" && (
                  <button className="button-link-danger" disabled={busy === customer.id} onClick={() => changeCustomerStatus(customer, "rechazado")}>Rechazar</button>
                )}
              </div>
            </article>
          ))}
          <p className="inventory-note">El primer pedido de alguien nuevo crea su solicitud aquí. Aceptar o rechazar no impide que siga comprando: es tu registro de quién es cliente fijo.</p>
        </section>
      ) : (
        <>
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

          <div className="settings-panel">
            <div className="settings-panel__intro"><p className="eyebrow">Avisos en este dispositivo</p><h2>Notificaciones de pedidos</h2><p>Recibe un aviso al instante cuando entre un pedido nuevo, sin tener el panel abierto.</p></div>
            {pushState === "unsupported" ? (
              <p className="inventory-note">Este navegador no admite notificaciones push.</p>
            ) : pushState === "denied" ? (
              <p className="inventory-note">Bloqueaste los avisos para este sitio. Actívalos desde los permisos del navegador y recarga la página.</p>
            ) : (
              <button
                className="button button--primary"
                type="button"
                disabled={pushState === "busy" || pushState === "on" || pushState === "checking"}
                onClick={enablePushNotifications}
              >
                {pushState === "on" ? "Notificaciones activadas" : pushState === "busy" ? `${pushStep || "Activando"}…` : "Activar notificaciones"}
              </button>
            )}
            {pushState === "on" && (
              <>
                <button className="text-button push-test-button" type="button" onClick={testPushNotification}>Enviar notificación de prueba</button>
                {pushTest && <p className="inventory-note">{pushTest}</p>}
              </>
            )}
          </div>

          <div className="settings-panel">
            <div className="settings-panel__intro"><p className="eyebrow">Para pasar a los clientes</p><h2>Enlace de la tienda</h2><p>Compártelo por WhatsApp, en estados o en redes. Quien lo abra puede pedir sin instalar nada.</p></div>
            <p className="store-link">{storeUrl}</p>
            <div className="store-link__actions">
              <button className="button button--primary" type="button" onClick={shareStoreLink}>Compartir enlace</button>
              <button className="button button--light" type="button" onClick={copyStoreLink}>{linkCopied ? "¡Copiado!" : "Copiar enlace"}</button>
            </div>
          </div>
        </>
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
  return new Intl.DateTimeFormat("es-CU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function withTimeout<T>(promise: Promise<T>, ms: number, step: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Se quedó en "${step}" y no respondió. Revisa los permisos de notificación del navegador y vuelve a intentarlo.`)), ms),
    ),
  ]);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function slugifyProductName(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return slug || `producto-${Date.now()}`;
}

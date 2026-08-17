import { useEffect, useMemo, useState } from "react";
import { getCatalog, placeOrder, type Product, type StoreSettings } from "../lib/api";

type Cart = Record<string, number>;

type Checkout = {
  customerName: string;
  phone: string;
  deliveryMethod: "recoger" | "domicilio";
  address: string;
  paymentMethod: "Transfermóvil" | "Efectivo";
  notes: string;
};

type CompletedOrder = {
  displayId: string;
  totalCup: number;
  whatsappUrl: string;
};

const defaultCheckout: Checkout = {
  customerName: "",
  phone: "",
  deliveryMethod: "recoger",
  address: "",
  paymentMethod: "Transfermóvil",
  notes: "",
};

export default function Storefront() {
  const logoUrl = `${import.meta.env.BASE_URL}don-padron-icon.png`;
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [category, setCategory] = useState("Todos");
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkout, setCheckout] = useState<Checkout>(defaultCheckout);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function loadCatalog() {
    try {
      const data = await getCatalog();
      setProducts(data.products ?? []);
      setSettings(data.settings ?? null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos cargar los productos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // La carga inicial sincroniza el catálogo con la base remota.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCatalog();
  }, []);

  const categories = useMemo(
    () => ["Todos", ...Array.from(new Set(products.map((product) => product.category)))],
    [products],
  );

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter(
      (product) =>
        (category === "Todos" || product.category === category) &&
        (!normalizedQuery ||
          `${product.name} ${product.description} ${product.category}`
            .toLowerCase()
            .includes(normalizedQuery)),
    );
  }, [category, products, query]);

  const cartItems = useMemo(
    () =>
      products
        .filter((product) => cart[product.id] > 0)
        .map((product) => ({ ...product, quantity: cart[product.id] })),
    [cart, products],
  );
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.priceCup * item.quantity,
    0,
  );

  function changeQuantity(product: Product, delta: number) {
    setCompletedOrder(null);
    setCart((current) => {
      const nextValue = Math.min(
        product.stock,
        Math.max(0, (current[product.id] ?? 0) + delta),
      );
      const next = { ...current };
      if (nextValue <= 0) delete next[product.id];
      else next[product.id] = Number(nextValue.toFixed(2));
      return next;
    });
  }

  function startCheckout() {
    setCartOpen(false);
    setCheckoutOpen(true);
    setError("");
  }

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const data = await placeOrder({
        ...checkout,
        items: cartItems.map((item) => ({ productId: item.id, quantity: item.quantity })),
      });
      const whatsappUrl = createWhatsappUrl(data, checkout, cartItems);
      setCompletedOrder({ ...data.order, whatsappUrl });
      setCart({});
      await loadCatalog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos crear el pedido.");
    } finally {
      setSubmitting(false);
    }
  }

  function finishOrder() {
    setCheckoutOpen(false);
    setCompletedOrder(null);
    setCheckout(defaultCheckout);
  }

  return (
    <div className="storefront">
      <header className="site-header">
        <div className="site-header__inner">
          <a href="#inicio" className="brand-lockup" aria-label="Don Padrón, inicio">
            <img src={logoUrl} alt="" />
            <span>
              <strong>Don Padrón</strong>
              <small>Elaborados cárnicos</small>
            </span>
          </a>
          <nav className="desktop-nav" aria-label="Navegación principal">
            <a href="#productos">Productos</a>
            <a href="#como-pedir">Cómo pedir</a>
            <a href="#pago">Pago</a>
          </nav>
          <button className="header-cart" onClick={() => setCartOpen(true)} aria-label={`Abrir carrito con ${formatQuantity(cartCount)} productos`}>
            <span>Mi pedido</span>
            <strong>{formatQuantity(cartCount)}</strong>
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="inicio">
          <div className="hero__content">
            <div className="hero__copy">
              <span className="hero-kicker"><i /> Elaboración propia · Fresco cada día</span>
              <h1>Buen sabor.<br /><em>Sin dar tantas vueltas.</em></h1>
              <p>Elige lo que quieres, comprueba si está disponible y deja tu pedido listo desde el teléfono.</p>
              <div className="hero-actions">
                <a className="button button--primary" href="#productos">Ver productos <span>↓</span></a>
                <span className="availability-message"><b>●</b> Disponibilidad actualizada</span>
              </div>
            </div>
            <div className="hero__visual" aria-label="Identidad visual de Don Padrón">
              <div className="hero-orbit hero-orbit--one" />
              <div className="hero-orbit hero-orbit--two" />
              <div className="hero-logo-card">
                <img src={logoUrl} alt="Ícono rojo de compras de Don Padrón" />
                <span>Tu pedido, directo del punto.</span>
              </div>
              <div className="hero-floating-note hero-floating-note--stock"><b>18</b><span>paquetes<br />disponibles</span></div>
              <div className="hero-floating-note hero-floating-note--fresh"><b>Hoy</b><span>elaboración<br />fresca</span></div>
            </div>
          </div>
        </section>

        <section className="catalog-section" id="productos">
          <div className="section-heading">
            <div><p className="eyebrow">Elige sin adivinar</p><h2>Lo que hay hoy</h2></div>
            <p>Cuando un producto se acaba, lo verás aquí antes de hacer el pedido.</p>
          </div>

          <div className="catalog-toolbar">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">Buscar productos</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar chorizo, jamón…" />
            </label>
            <div className="category-list" role="group" aria-label="Filtrar por categoría">
              {categories.map((item) => (
                <button key={item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{item}</button>
              ))}
            </div>
          </div>

          {error && <div className="catalog-error" role="alert"><span>!</span><div><strong>No pudimos actualizar la tienda.</strong><p>{error}</p></div><button onClick={() => void loadCatalog()}>Reintentar</button></div>}

          {loading ? (
            <div className="product-grid" aria-label="Cargando productos">
              {[1, 2, 3, 4, 5, 6].map((item) => <div className="product-card product-card--loading" key={item} />)}
            </div>
          ) : (
            <div className="product-grid">
              {visibleProducts.map((product, index) => {
                const quantity = cart[product.id] ?? 0;
                const soldOut = product.stock <= 0;
                const lowStock = product.stock > 0 && product.stock <= 5;
                return (
                  <article className={`product-card ${soldOut ? "is-sold-out" : ""}`} key={product.id}>
                    <div className="product-art" style={{ "--product-accent": product.accent } as React.CSSProperties}>
                      <span className="product-art__number">0{index + 1}</span>
                      <span className="product-art__emoji" role="img" aria-label="">{product.emoji}</span>
                      <span className="product-art__stamp">HECHO<br />AQUÍ</span>
                    </div>
                    <div className="product-card__body">
                      <div className="product-meta"><span>{product.category}</span><span className={soldOut ? "stock-badge stock-badge--out" : lowStock ? "stock-badge stock-badge--low" : "stock-badge"}>{soldOut ? "Agotado" : lowStock ? `Quedan ${formatQuantity(product.stock)}` : "Disponible"}</span></div>
                      <h3>{product.name}</h3>
                      <p>{product.description}</p>
                      <div className="product-card__footer">
                        <div className="product-price"><strong>{formatCup(product.priceCup)}</strong><span>{product.unit}</span></div>
                        {quantity > 0 ? (
                          <div className="quantity-control" aria-label={`Cantidad de ${product.name}`}>
                            <button onClick={() => changeQuantity(product, -product.minimumStep)} aria-label="Restar">−</button>
                            <strong>{formatQuantity(quantity)}</strong>
                            <button onClick={() => changeQuantity(product, product.minimumStep)} disabled={quantity >= product.stock} aria-label="Sumar">+</button>
                          </div>
                        ) : (
                          <button className="add-button" disabled={soldOut} onClick={() => changeQuantity(product, product.minimumStep)}>{soldOut ? "Sin stock" : "Añadir"}<span>+</span></button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
              {!visibleProducts.length && <div className="no-results"><strong>No encontramos ese producto.</strong><span>Prueba otra palabra o categoría.</span></div>}
            </div>
          )}
        </section>

        <section className="steps-section" id="como-pedir">
          <div className="steps-intro"><p className="eyebrow eyebrow--light">Comprar es sencillo</p><h2>Tres pasos y ya.</h2><p>Sin llamadas perdidas ni listas por separado.</p></div>
          <div className="steps-grid">
            <article><span>01</span><div className="step-icon">＋</div><h3>Arma tu pedido</h3><p>Añade solo productos que tienen existencia.</p></article>
            <article><span>02</span><div className="step-icon">✓</div><h3>Deja tus datos</h3><p>Elige recoger o solicitar entrega a domicilio.</p></article>
            <article><span>03</span><div className="step-icon">W</div><h3>Confirma por WhatsApp</h3><p>Recibe el resumen y coordina el pago.</p></article>
          </div>
        </section>

        <section className="payment-section" id="pago">
          <div className="payment-card">
            <div className="payment-card__icon">$</div>
            <div><p className="eyebrow">Paga como te convenga</p><h2>Transfermóvil o efectivo.</h2><p>{settings?.paymentCopy ?? "Los datos de pago se comparten al confirmar tu pedido."}</p></div>
            <div className="payment-methods"><span><b>↗</b> Transfermóvil</span><span><b>●</b> Efectivo</span></div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="brand-lockup brand-lockup--footer"><img src={logoUrl} alt="" /><span><strong>Don Padrón</strong><small>Elaborados cárnicos</small></span></div>
        <p>Productos hechos con cuidado para resolver tu mesa.</p>
        <div><span>© 2026 Don Padrón</span><a href="#/admin">Acceso del negocio</a></div>
      </footer>

      {cartCount > 0 && !cartOpen && !checkoutOpen && (
        <button className="mobile-cart-bar" onClick={() => setCartOpen(true)}><span><b>{formatQuantity(cartCount)}</b> Ver mi pedido</span><strong>{formatCup(cartTotal)}</strong></button>
      )}

      {(cartOpen || checkoutOpen) && <button className="sheet-backdrop" aria-label="Cerrar" onClick={() => { setCartOpen(false); setCheckoutOpen(false); }} />}

      <aside className={`cart-sheet ${cartOpen ? "is-open" : ""}`} aria-hidden={!cartOpen}>
        <div className="sheet-header"><div><p className="eyebrow">Tu selección</p><h2>Mi pedido</h2></div><button onClick={() => setCartOpen(false)} aria-label="Cerrar carrito">×</button></div>
        <div className="cart-lines">
          {cartItems.length ? cartItems.map((item) => (
            <article className="cart-line" key={item.id}><span className="cart-line__emoji">{item.emoji}</span><div><strong>{item.name}</strong><small>{formatCup(item.priceCup)} · {item.unit}</small><div className="quantity-control quantity-control--cart"><button onClick={() => changeQuantity(item, -item.minimumStep)}>−</button><strong>{formatQuantity(item.quantity)}</strong><button onClick={() => changeQuantity(item, item.minimumStep)} disabled={item.quantity >= item.stock}>+</button></div></div><b>{formatCup(item.priceCup * item.quantity)}</b></article>
          )) : <div className="empty-cart"><span>🛒</span><strong>Tu pedido está vacío.</strong><p>Añade algo rico del catálogo.</p></div>}
        </div>
        {cartItems.length > 0 && <div className="sheet-summary"><div><span>Total estimado</span><strong>{formatCup(cartTotal)}</strong></div><small>La existencia se reserva cuando completas el pedido.</small><button className="button button--primary button--full" onClick={startCheckout}>Continuar con mis datos <span>→</span></button></div>}
      </aside>

      <aside className={`checkout-sheet ${checkoutOpen ? "is-open" : ""}`} aria-hidden={!checkoutOpen}>
        <div className="sheet-header"><div><p className="eyebrow">Último paso</p><h2>{completedOrder ? "Pedido creado" : "Tus datos"}</h2></div><button onClick={() => setCheckoutOpen(false)} aria-label="Cerrar">×</button></div>
        {completedOrder ? (
          <div className="order-success"><div className="success-mark">✓</div><p className="eyebrow">Listo para confirmar</p><h3>{completedOrder.displayId}</h3><p>Ya reservamos la existencia. Envía el resumen por WhatsApp para coordinar pago y entrega.</p><div className="success-total"><span>Total</span><strong>{formatCup(completedOrder.totalCup)}</strong></div><a className="button button--whatsapp button--full" href={completedOrder.whatsappUrl} target="_blank" rel="noreferrer">Confirmar por WhatsApp <span>W</span></a><button className="text-button" onClick={finishOrder}>Volver a la tienda</button></div>
        ) : (
          <form className="checkout-form" onSubmit={submitOrder}>
            <div className="checkout-total"><span>{formatQuantity(cartCount)} productos</span><strong>{formatCup(cartTotal)}</strong></div>
            <label><span>Tu nombre</span><input required value={checkout.customerName} onChange={(event) => setCheckout({ ...checkout, customerName: event.target.value })} placeholder="Nombre y apellidos" autoComplete="name" /></label>
            <label><span>Teléfono</span><input required value={checkout.phone} onChange={(event) => setCheckout({ ...checkout, phone: event.target.value })} placeholder="Ej. 5 123 4567" inputMode="tel" autoComplete="tel" /></label>
            <fieldset><legend>¿Cómo lo recibes?</legend><div className="option-grid"><label className={checkout.deliveryMethod === "recoger" ? "is-selected" : ""}><input type="radio" name="delivery" value="recoger" checked={checkout.deliveryMethod === "recoger"} onChange={() => setCheckout({ ...checkout, deliveryMethod: "recoger" })} /><b>Recoger</b><span>En el punto</span></label><label className={checkout.deliveryMethod === "domicilio" ? "is-selected" : ""}><input type="radio" name="delivery" value="domicilio" checked={checkout.deliveryMethod === "domicilio"} onChange={() => setCheckout({ ...checkout, deliveryMethod: "domicilio" })} /><b>Domicilio</b><span>A coordinar</span></label></div></fieldset>
            {checkout.deliveryMethod === "recoger" && settings?.pickupAddress && <p className="pickup-note">Recogida: {settings.pickupAddress}</p>}
            {checkout.deliveryMethod === "domicilio" && <label><span>Dirección de entrega</span><textarea required value={checkout.address} onChange={(event) => setCheckout({ ...checkout, address: event.target.value })} placeholder="Calle, número, entrecalles y municipio" /></label>}
            <fieldset><legend>Forma de pago</legend><div className="option-grid"><label className={checkout.paymentMethod === "Transfermóvil" ? "is-selected" : ""}><input type="radio" name="payment" value="Transfermóvil" checked={checkout.paymentMethod === "Transfermóvil"} onChange={() => setCheckout({ ...checkout, paymentMethod: "Transfermóvil" })} /><b>Transfermóvil</b><span>Datos por WhatsApp</span></label><label className={checkout.paymentMethod === "Efectivo" ? "is-selected" : ""}><input type="radio" name="payment" value="Efectivo" checked={checkout.paymentMethod === "Efectivo"} onChange={() => setCheckout({ ...checkout, paymentMethod: "Efectivo" })} /><b>Efectivo</b><span>Al recibir</span></label></div></fieldset>
            <label><span>Nota <small>(opcional)</small></span><textarea value={checkout.notes} onChange={(event) => setCheckout({ ...checkout, notes: event.target.value })} placeholder="Alguna indicación para el pedido" maxLength={300} /></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="button button--primary button--full" type="submit" disabled={submitting}>{submitting ? "Creando tu pedido…" : "Crear pedido"}<span>→</span></button>
            <p className="form-note">Al crear el pedido reservamos la existencia para ti.</p>
          </form>
        )}
      </aside>
    </div>
  );
}

function formatCup(value: number) {
  return `${new Intl.NumberFormat("es-CU").format(Math.round(value))} CUP`;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function createWhatsappUrl(
  result: Awaited<ReturnType<typeof placeOrder>>,
  checkout: Checkout,
  items: Array<Product & { quantity: number }>,
) {
  const message = [
    `Hola, quiero confirmar mi pedido ${result.order.displayId}.`,
    "",
    ...items.map((item) =>
      `• ${formatQuantity(item.quantity)} × ${item.name} — ${formatCup(item.priceCup * item.quantity)}`,
    ),
    "",
    `Total: ${formatCup(result.order.totalCup)}`,
    `Cliente: ${checkout.customerName}`,
    `Teléfono: ${checkout.phone}`,
    `Entrega: ${checkout.deliveryMethod === "domicilio" ? `Domicilio — ${checkout.address}` : `Recoger en ${result.settings.pickupAddress || "el punto"}`}`,
    `Pago: ${checkout.paymentMethod}`,
    result.settings.paymentCopy ? `Indicaciones de pago: ${result.settings.paymentCopy}` : "",
    checkout.notes ? `Nota: ${checkout.notes}` : "",
  ].filter(Boolean).join("\n");
  const phone = result.settings.whatsappPhone.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

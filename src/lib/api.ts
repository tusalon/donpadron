import { supabase } from "./supabase";

export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  unit: string;
  priceCup: number;
  stock: number;
  minimumStep: number;
  emoji: string;
  accent: string;
  photoUrl: string;
};

export type StoreSettings = {
  businessName: string;
  whatsappPhone: string;
  pickupAddress: string;
  paymentCopy: string;
};

export type AdminProduct = Product & {
  active: boolean;
};

export type AdminOrder = {
  id: string;
  displayId: string;
  customerId: string | null;
  customerName: string;
  phone: string;
  deliveryMethod: string;
  address: string;
  paymentMethod: string;
  notes: string;
  totalCup: number;
  status: string;
  createdAt: string;
  items: Array<{
    id: number;
    productId: string;
    productName: string;
    quantity: number;
    unit: string;
    priceEachCup: number;
    subtotalCup: number;
  }>;
};

export type CustomerStatus = "pendiente" | "aceptado" | "rechazado";

export type Customer = {
  id: string;
  name: string;
  phone: string;
  status: CustomerStatus;
  createdAt: string;
  orderCount: number;
  totalSpentCup: number;
  lastOrderAt: string | null;
};

export type CustomerDetail = {
  topProducts: Array<{ productName: string; quantity: number; totalCup: number }>;
  orders: Array<{ id: string; displayId: string; totalCup: number; status: string; createdAt: string }>;
};

export type AdminDashboard = {
  products: AdminProduct[];
  customers: Customer[];
  orders: AdminOrder[];
  settings: StoreSettings;
};

type Catalog = {
  products: Product[];
  settings: StoreSettings;
};

type OrderPayload = {
  customerName: string;
  phone: string;
  deliveryMethod: "recoger" | "domicilio";
  address: string;
  paymentMethod: "Transfermóvil" | "Efectivo";
  notes: string;
  items: Array<{ productId: string; quantity: number }>;
};

export type CreatedOrder = {
  order: { id: string; displayId: string; totalCup: number };
  settings: Pick<StoreSettings, "whatsappPhone" | "pickupAddress" | "paymentCopy">;
};

export async function getCatalog(): Promise<Catalog> {
  const { data, error } = await supabase.rpc("get_catalog");
  if (error) throw new Error(readableError(error.message, "No pudimos cargar los productos."));
  return data as Catalog;
}

export async function placeOrder(payload: OrderPayload): Promise<CreatedOrder> {
  const { data, error } = await supabase.rpc("place_order", { p_payload: payload });
  if (error) throw new Error(readableError(error.message, "No pudimos crear el pedido."));
  const order = data as CreatedOrder;
  void notifyNewOrder(order.order.displayId, order.order.totalCup);
  return order;
}

// El pedido ya se creó: un fallo aquí no debe romper la compra del cliente,
// pero sí queda registrado para poder diagnosticarlo.
async function notifyNewOrder(displayId: string, totalCup: number) {
  try {
    const { data, error } = await supabase.functions.invoke("notify-new-order", {
      body: { displayId, totalCup },
    });
    if (error) console.error("Aviso de pedido nuevo falló:", error.message);
    else if (data?.failed) console.error("Aviso de pedido nuevo con errores:", data.errors);
  } catch (caught) {
    console.error("Aviso de pedido nuevo falló:", caught);
  }
}

export type PushTestResult = { sent: number; failed: number; errors: string[] };

export async function sendTestPushNotification(): Promise<PushTestResult> {
  const { data, error } = await supabase.functions.invoke("notify-new-order", {
    body: { test: true },
  });
  if (error) throw new Error(await readFunctionError(error, "No pudimos enviar la prueba."));
  return data as PushTestResult;
}

// Los errores de una funcion edge traen el detalle util dentro del cuerpo de la
// respuesta, no en el mensaje, que siempre dice lo mismo.
async function readFunctionError(error: unknown, fallback: string) {
  const response = (error as { context?: Response })?.context;
  if (response instanceof Response) {
    try {
      const body = await response.json();
      if (body?.error) return String(body.error);
    } catch {
      // Respuesta sin JSON: nos quedamos con el mensaje original.
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export async function uploadProductPhoto(file: File): Promise<string> {
  const cloudName = import.meta.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) throw new Error("Falta configurar Cloudinary.");

  const body = new FormData();
  body.append("file", file);
  body.append("upload_preset", uploadPreset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "No pudimos subir la imagen.");
  return data.secure_url as string;
}

export async function saveAdminPushSubscription(token: string, subscription: PushSubscriptionJSON) {
  const keys = subscription.keys;
  if (!subscription.endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error("La suscripción de notificaciones no es válida.");
  }
  const { error } = await supabase.rpc("admin_save_push_subscription", {
    p_token: token,
    p_endpoint: subscription.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) throw new Error(readableError(error.message, "No pudimos activar las notificaciones."));
}

export type TrackedOrder = {
  displayId: string;
  customerName: string;
  status: string;
  totalCup: number;
  deliveryMethod: string;
  address: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
  items: Array<{ id: number; productName: string; quantity: number; unit: string; subtotalCup: number }>;
  business: { name: string; whatsappPhone: string; pickupAddress: string };
};

export async function getOrderStatus(orderId: string): Promise<TrackedOrder> {
  const { data, error } = await supabase.rpc("get_order_status", { p_order_id: orderId });
  if (error) throw new Error(readableError(error.message, "No pudimos encontrar ese pedido."));
  return data as TrackedOrder;
}

export async function adminLogin(password: string): Promise<string> {
  const { data, error } = await supabase.rpc("admin_login", { p_password: password });
  if (error) throw new Error("No pudimos comprobar la contraseña. Intenta nuevamente.");
  if (!data) throw new Error("La contraseña no es correcta.");
  return data as string;
}

export async function adminLogout(token: string) {
  await supabase.rpc("admin_logout", { p_token: token });
}

export async function getAdminDashboard(token: string): Promise<AdminDashboard> {
  const { data, error } = await supabase.rpc("admin_dashboard", { p_token: token });
  if (error) throw new Error(readableError(error.message, "No pudimos cargar el panel."));
  return data as AdminDashboard;
}

export async function updateAdminProduct(
  token: string,
  product: Pick<AdminProduct, "id" | "stock" | "priceCup" | "active">,
) {
  const { error } = await supabase.rpc("admin_update_product", {
    p_token: token,
    p_product_id: product.id,
    p_stock: product.stock,
    p_price_cup: Math.round(product.priceCup),
    p_active: product.active,
  });
  if (error) throw new Error(readableError(error.message, "No pudimos guardar el producto."));
}

export async function saveAdminProduct(
  token: string,
  product: AdminProduct,
  isNew: boolean,
): Promise<AdminProduct> {
  const { data, error } = await supabase.rpc("admin_save_product", {
    p_token: token,
    p_product: product,
    p_create: isNew,
  });
  if (error) throw new Error(readableError(error.message, "No pudimos guardar el producto."));
  return data as AdminProduct;
}

export async function setCustomerStatus(token: string, customerId: string, status: CustomerStatus) {
  const { error } = await supabase.rpc("admin_set_customer_status", {
    p_token: token,
    p_customer_id: customerId,
    p_status: status,
  });
  if (error) throw new Error(readableError(error.message, "No pudimos actualizar el cliente."));
}

export async function getCustomerDetail(token: string, customerId: string): Promise<CustomerDetail> {
  const { data, error } = await supabase.rpc("admin_customer_detail", {
    p_token: token,
    p_customer_id: customerId,
  });
  if (error) throw new Error(readableError(error.message, "No pudimos cargar la ficha del cliente."));
  return data as CustomerDetail;
}

export async function updateAdminOrder(token: string, orderId: string, status: string) {
  const { error } = await supabase.rpc("admin_update_order", {
    p_token: token,
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw new Error(readableError(error.message, "No pudimos actualizar el pedido."));
}

export async function updateAdminSettings(token: string, settings: StoreSettings) {
  const { error } = await supabase.rpc("admin_update_settings", {
    p_token: token,
    p_business_name: settings.businessName,
    p_whatsapp_phone: settings.whatsappPhone,
    p_pickup_address: settings.pickupAddress,
    p_payment_copy: settings.paymentCopy,
  });
  if (error) throw new Error(readableError(error.message, "No pudimos guardar los datos."));
}

function readableError(message: string, fallback: string) {
  const known = [
    "Escribe tu nombre",
    "Forma de entrega",
    "Escribe la dirección",
    "Forma de pago",
    "Añade al menos",
    "Revisa",
    "Uno de los productos",
    "Solo quedan",
    "La sesión administrativa",
    "Producto no encontrado",
    "El identificador",
    "El color",
    "La foto",
    "Completa nombre",
    "Ya existe",
    "La suscripción",
    "Cliente no encontrado",
    "Estado de cliente",
    "Pedido no encontrado",
    "Un pedido cancelado",
    "Estado de pedido",
    "Completa los datos",
    "Escribe el número",
  ];
  return known.some((start) => message.startsWith(start)) ? message : fallback;
}

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
};

export type StoreSettings = {
  businessName: string;
  whatsappPhone: string;
  pickupAddress: string;
  paymentCopy: string;
};

export type AdminProduct = Omit<Product, "description" | "accent"> & {
  active: boolean;
};

export type AdminOrder = {
  id: string;
  displayId: string;
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

export type AdminDashboard = {
  products: AdminProduct[];
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
  return data as CreatedOrder;
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
    "Pedido no encontrado",
    "Un pedido cancelado",
    "Estado de pedido",
    "Completa los datos",
    "Escribe el número",
  ];
  return known.some((start) => message.startsWith(start)) ? message : fallback;
}

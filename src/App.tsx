import { useEffect, useState } from "react";
import AdminPortal from "./components/AdminPortal";
import OrderTracker from "./components/OrderTracker";
import Storefront from "./components/Storefront";

function currentRoute() {
  const hash = window.location.hash;
  if (hash.startsWith("#/admin")) return { name: "admin" as const, orderId: "" };
  const tracked = hash.match(/^#\/pedido\/([0-9a-fA-F-]{36})/);
  if (tracked) return { name: "order" as const, orderId: tracked[1] };
  return { name: "store" as const, orderId: "" };
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const updateRoute = () => setRoute(currentRoute());
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  // Al añadir a pantalla de inicio, Android abre el start_url del manifiesto y
  // descarta el hash actual. El panel necesita el suyo para no abrir la tienda.
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const base = import.meta.env.BASE_URL;
    link.href = route.name === "admin" ? `${base}admin.webmanifest` : `${base}manifest.webmanifest`;
  }, [route.name]);

  if (route.name === "admin") return <AdminPortal />;
  if (route.name === "order") return <OrderTracker orderId={route.orderId} />;
  return <Storefront />;
}

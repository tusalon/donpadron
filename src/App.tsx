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

  if (route.name === "admin") return <AdminPortal />;
  if (route.name === "order") return <OrderTracker orderId={route.orderId} />;
  return <Storefront />;
}

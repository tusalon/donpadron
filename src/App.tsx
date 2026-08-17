import { useEffect, useState } from "react";
import AdminPortal from "./components/AdminPortal";
import Storefront from "./components/Storefront";

function currentRoute() {
  return window.location.hash.startsWith("#/admin") ? "admin" : "store";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const updateRoute = () => setRoute(currentRoute());
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);

  return route === "admin" ? <AdminPortal /> : <Storefront />;
}

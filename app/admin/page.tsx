import { redirect } from "next/navigation";
import { isAdminRequest } from "../admin-auth";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Panel del negocio | Don Padrón",
  description: "Control de inventario y pedidos de Don Padrón.",
};

export default function AdminPage() {
  return <AdminGate />;
}

async function AdminGate() {
  if (process.env.NODE_ENV === "development") {
    return <AdminClient displayName="Vista local" />;
  }

  if (!(await isAdminRequest())) redirect("/admin/login?return_to=/admin");

  return <AdminClient displayName="Administración" />;
}

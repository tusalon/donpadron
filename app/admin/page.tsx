import Link from "next/link";
import { configuredAdminEmails } from "../admin-auth";
import { requireChatGPTUser } from "../chatgpt-auth";
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

  const user = await requireChatGPTUser("/admin");
  const allowed = configuredAdminEmails();
  if (!allowed.includes(user.email.toLowerCase())) {
    return (
      <main className="admin-access-page">
        <div className="admin-access-card">
          <img src="/don-padron-icon.png" alt="Don Padrón" />
          <p className="eyebrow">Acceso del negocio</p>
          <h1>Esta cuenta no tiene permiso.</h1>
          <p>
            Iniciaste sesión como <strong>{user.email}</strong>. Añade este correo a la lista de
            administradores para entrar.
          </p>
          <Link href="/">Volver a la tienda</Link>
        </div>
      </main>
    );
  }

  return <AdminClient displayName={user.displayName} />;
}

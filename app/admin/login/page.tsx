import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminRequest, safeAdminReturnTo } from "../../admin-auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Entrar a la administración | Don Padrón",
  description: "Acceso privado al panel del negocio Don Padrón.",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; return_to?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  if (await isAdminRequest()) redirect("/admin");

  const params = await searchParams;
  const returnTo = safeAdminReturnTo(params.return_to ?? "/admin");

  return (
    <main className="admin-access-page">
      <div className="admin-access-card admin-login-card">
        <img src="/don-padron-icon.png" alt="Don Padrón" />
        <p className="eyebrow">Acceso privado</p>
        <h1>Administración</h1>
        <p>Entra con la contraseña privada del negocio.</p>

        {params.error === "1" && (
          <div className="admin-login-error" role="alert">
            La contraseña no es correcta. Inténtalo otra vez.
          </div>
        )}

        <form className="admin-login-form" action="/api/admin-session" method="post">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label htmlFor="admin-password">Contraseña</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            autoFocus
            placeholder="Escribe tu contraseña"
          />
          <button type="submit">Entrar al panel</button>
        </form>

        <Link href="/">Volver a la tienda</Link>
      </div>
    </main>
  );
}

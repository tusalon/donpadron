import { useCallback, useState } from "react";
import { adminLogin, adminLogout } from "../lib/api";
import AdminClient from "./AdminClient";

const TOKEN_KEY = "donpadron_admin_token";

export default function AdminPortal() {
  const logoUrl = `${import.meta.env.BASE_URL}icon-192.png`;
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const nextToken = await adminLogin(password);
      sessionStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos entrar al panel.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    const currentToken = token;
    clearSession();
    if (currentToken) await adminLogout(currentToken);
  }

  if (token) {
    return <AdminClient token={token} onLogout={() => void logout()} onSessionExpired={clearSession} />;
  }

  return (
    <main className="admin-access-page">
      <div className="admin-access-card admin-login-card">
        <img src={logoUrl} alt="Don Padrón" />
        <p className="eyebrow">Acceso privado</p>
        <h1>Administración</h1>
        <p>Entra con la contraseña privada del negocio.</p>

        {error && <div className="admin-login-error" role="alert">{error}</div>}

        <form className="admin-login-form" onSubmit={login}>
          <label htmlFor="admin-password">Contraseña</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Escribe tu contraseña"
          />
          <button type="submit" disabled={busy}>{busy ? "Comprobando…" : "Entrar al panel"}</button>
        </form>

        <a href="#inicio">Volver a la tienda</a>
      </div>
    </main>
  );
}

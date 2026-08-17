import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "donpadron_admin_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export async function isAdminRequest(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;

  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSession(session);
}

export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const configured = process.env.ADMIN_PASSWORD ?? "";
  if (!configured || !candidate) return false;

  const [candidateHash, configuredHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(configured)),
  ]);

  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(configuredHash);
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function createAdminSession(): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `v1.${expiresAt}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function verifyAdminSession(value?: string): Promise<boolean> {
  if (!value) return false;

  const [version, expiresText, signature] = value.split(".");
  if (version !== "v1" || !expiresText || !signature) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const key = await sessionKey();
  if (!key) return false;

  try {
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromHex(signature),
      encoder.encode(`${version}.${expiresText}`),
    );
  } catch {
    return false;
  }
}

export function adminSessionCookie(value: string, maxAge = SESSION_SECONDS): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function safeAdminReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin";

  try {
    const url = new URL(value, "https://donpadron.local");
    if (url.origin !== "https://donpadron.local") return "/admin";
    if (url.pathname === "/admin/login" || url.pathname.startsWith("/api/admin-session")) {
      return "/admin";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/admin";
  }
}

async function sign(payload: string): Promise<string> {
  const key = await sessionKey();
  if (!key) throw new Error("La clave de sesión administrativa no está configurada.");

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(new Uint8Array(signature));
}

async function sessionKey(): Promise<CryptoKey | null> {
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  if (!secret) return null;

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(value)) return new Uint8Array();

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

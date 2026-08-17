import { getChatGPTUser } from "./chatgpt-auth";

export async function isAdminRequest(): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return true;

  const user = await getChatGPTUser();
  if (!user) return false;

  const allowlist = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(user.email.toLowerCase());
}

export function configuredAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

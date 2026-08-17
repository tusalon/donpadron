import {
  adminSessionCookie,
  createAdminSession,
  safeAdminReturnTo,
  verifyAdminPassword,
} from "../../admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const returnTo = safeAdminReturnTo(String(form.get("returnTo") ?? "/admin"));

  if (!(await verifyAdminPassword(password))) {
    const location = new URL("/admin/login", request.url);
    location.searchParams.set("error", "1");
    location.searchParams.set("return_to", returnTo);
    return redirectResponse(location, adminSessionCookie("", 0));
  }

  try {
    const session = await createAdminSession();
    return redirectResponse(new URL(returnTo, request.url), adminSessionCookie(session));
  } catch {
    return Response.json(
      { error: "El acceso administrativo todavía no está configurado." },
      { status: 503 },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("logout") !== "1") {
    return Response.json({ error: "Acción inválida." }, { status: 400 });
  }

  return redirectResponse(
    new URL("/admin/login", request.url),
    adminSessionCookie("", 0),
  );
}

function redirectResponse(location: URL, cookie: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location.toString(),
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
  });
}

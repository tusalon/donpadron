import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const description = "Comprueba disponibilidad, arma tu pedido y confirma por WhatsApp en Don Padrón.";

  return {
    metadataBase,
    title: {
      default: "Don Padrón | Elaborados cárnicos",
      template: "%s | Don Padrón",
    },
    description,
    applicationName: "Don Padrón",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/don-padron-icon.png",
      apple: "/don-padron-icon.png",
    },
    appleWebApp: {
      capable: true,
      title: "Don Padrón",
      statusBarStyle: "black-translucent",
    },
    openGraph: {
      type: "website",
      locale: "es_CU",
      title: "Don Padrón | Elaborados cárnicos",
      description,
      siteName: "Don Padrón",
      images: [{ url: "/og.png", width: 1760, height: 907, alt: "Don Padrón, elaborados cárnicos y pedidos por WhatsApp" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Don Padrón | Elaborados cárnicos",
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}

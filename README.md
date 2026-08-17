# Don Padrón

Catálogo móvil y panel de pedidos para un punto de elaboración de productos cárnicos.

## Enlaces para compartir

- **Tienda para clientes:** https://tusalon.github.io/donpadron/
- **Descargar la aplicación Android:** https://github.com/tusalon/donpadron/releases/download/android-latest/Don-Padron.apk
- **Panel del negocio:** https://don-padron.leetomy437.chatgpt.site/admin

El enlace de la tienda se puede publicar en grupos de WhatsApp, Facebook, Telegram y otras redes. La APK abre la misma tienda y recibe inmediatamente los cambios de productos, precios y existencias.

## Incluye

- Catálogo público con disponibilidad real.
- Carrito y pedido desde el teléfono.
- Reserva automática de existencias al crear el pedido.
- Confirmación por WhatsApp con resumen y total.
- Panel del negocio para pedidos, inventario, precios y datos de pago.
- Base de datos D1 y migraciones incluidas.

## Desarrollo

```bash
npm install
npm run dev
npm run build
```

En producción, define `ADMIN_EMAILS` con los correos autorizados para abrir `/admin`. Se pueden separar varios correos con comas.

## APK para Android

El proyecto Android está en `android-app/`. La automatización `.github/workflows/android-apk.yml` compila una APK firmada en cada cambio de la rama `main` y actualiza el archivo de la versión `android-latest` de GitHub Releases.

La firma usa estos secretos del repositorio:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

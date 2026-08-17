# Don Padrón

Catálogo móvil y panel de pedidos para un punto de elaboración de productos cárnicos.

## Enlaces públicos

- Tienda para clientes: https://tusalon.github.io/donpadron/
- Administración: https://tusalon.github.io/donpadron/#/admin
- APK de clientes: https://github.com/tusalon/donpadron/releases/download/android-latest/Don-Padron.apk
- APK de administración: https://github.com/tusalon/donpadron/releases/download/android-latest/Don-Padron-Admin.apk

El enlace de la tienda es el que se puede publicar en grupos, estados y redes sociales. Los clientes no necesitan iniciar sesión.

## Arquitectura independiente

- GitHub Pages publica la PWA.
- Supabase guarda productos, existencias, pedidos y ajustes.
- La administración usa una contraseña propia del negocio y una sesión temporal guardada en el dispositivo.
- GitHub Actions compila la web y las dos APK.

La tienda y la administración funcionan con las cuentas propias de GitHub y Supabase.

## Desarrollo local

```bash
npm install
npm run dev
npm run build
npm test
```

Crea `.env.local` a partir de `.env.example` y coloca la URL y la clave publicable de Supabase. Nunca uses una clave `service_role` en el navegador.

## Base de datos

Las migraciones de PostgreSQL están en `supabase/migrations`. Incluyen:

- catálogo público de solo lectura;
- pedidos atómicos con descuento de existencias;
- devolución de existencias al cancelar;
- panel privado para pedidos, inventario y datos de pago;
- Row Level Security en todas las tablas públicas.

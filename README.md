# SIVEP - Sistema de Inventario, Ventas y Producción

## Granja El Cairo — Universidad Nacional de Colombia, Sede Orinoquía

Sistema completo de gestión para la Granja El Cairo con arquitectura cliente-servidor.
Incluye inventario, ventas, clientes, reportes, analítica avanzada y un módulo de
**monetización SaaS** (planes, suscripciones, licencias on-premise y servicios de
valor agregado) con aislamiento **multi-tenant** por organización.

---

## Tabla de contenido

- [Stack tecnológico](#stack-tecnológico)
- [Paleta de colores UNAL](#paleta-de-colores-unal)
- [Instalación y configuración](#instalación-y-configuración)
- [Multi-tenant (aislamiento por organización)](#multi-tenant-aislamiento-por-organización)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Funcionalidades](#funcionalidades)
- [Roles y permisos](#roles-y-permisos)
- [API](#api)
- [Monetización](#monetización)
- [Cookies y consentimiento](#cookies-y-consentimiento)
- [Variables de entorno](#variables-de-entorno)
- [Scripts disponibles](#scripts-disponibles)
- [UI/UX](#uiux)
- [Seguridad, privacidad y cumplimiento](#seguridad-privacidad-y-cumplimiento)
- [Licencia](#licencia)

---

## Stack tecnológico

**Backend**
- Node.js con JavaScript (ES Modules)
- Fastify como framework HTTP
- MySQL (`mysql2` con promesas)
- JWT para autenticación (`@fastify/jwt`)
- `bcryptjs` para hash de contraseñas
- `@fastify/multipart` para subida de archivos (comprobantes)
- `@fastify/helmet` y `@fastify/rate-limit` para seguridad
- `@fastify/cookie` para la cookie técnica de consentimiento
- Cloudinary para el alojamiento de imágenes
- `cors`, `dotenv` y `Joi` para CORS, configuración y validaciones

**Frontend**
- React 18 con JavaScript
- Vite como bundler
- Tailwind CSS para estilos
- React Router DOM v6 para enrutado
- Axios para peticiones HTTP
- Recharts para gráficos
- Lucide React para iconos

---

## Paleta de colores UNAL

| Rol | Color | Hex |
|-----|-------|-----|
| Primario | Granate | `#8B1E3F` |
| Acento | Verde oliva | `#5B8C4E` |
| Secundario | Gris oscuro | `#4A4A4A` |
| Fondo | Gris claro | `#F8F9FA` |

Tipografía: **Inter**.

---

## Instalación y configuración

### Prerrequisitos

- Node.js 18+
- MySQL 8.0+
- `pnpm` (recomendado) o `npm`

### 1. Base de datos MySQL

```sql
CREATE DATABASE sivep CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales (MySQL, JWT_SECRET, etc.)
pnpm install
pnpm run db:migrate        # Crea el esquema base
pnpm run db:seed           # Datos de ejemplo (organización y catálogo)
pnpm run db:add-billing    # Tablas de monetización (idempotente)
pnpm run db:add-multitenant # Aislamiento multi-tenant (idempotente)
pnpm run dev
```

El servidor corre en `http://localhost:3000`.

> En bases de datos ya existentes basta con ejecutar `db:add-billing` y
> `db:add-multitenant` una vez: son migraciones incrementales e idempotentes
> (se pueden repetir sin dañar datos).

### 3. Frontend

```bash
cd frontend
cp .env.example .env
pnpm install
pnpm run dev
```

La aplicación corre en `http://localhost:5173`.

---

## Multi-tenant (aislamiento por organización)

Cada organización (granja/institución) es un **tenant** independiente. El aislamiento
se aplica a nivel de datos:

- Tabla `organizations` y columna `users.organization_id`.
- Las tablas de negocio (`products`, `customers`, `sales`, `inventory_movements`)
  incluyen `organization_id` y **todas las consultas filtran por la organización**
  del usuario autenticado.
- El identificador de organización viaja firmado en el JWT y, para tokens antiguos,
  el middleware lo resuelve desde la base de datos.
- El documento de un cliente es único **dentro de cada organización**, no globalmente.
- El formulario público resuelve la organización por defecto configurable.

El resultado: una organización **nunca** puede ver ni modificar datos de otra, ni
siquiera conociendo los identificadores.

---

## Estructura del proyecto

```
SIVEP/
├── backend/
│   ├── src/
│   │   ├── config/         # Configuración de base de datos
│   │   ├── controllers/    # Controladores de cada entidad
│   │   ├── database/       # Migraciones, esquemas y seeds
│   │   ├── middleware/     # Auth, roles, planes (gating) y organización
│   │   ├── routes/         # Rutas de la API
│   │   ├── utils/          # Utilidades y helpers
│   │   ├── validators/     # Esquemas de validación Joi
│   │   └── server.js       # Punto de entrada
│   ├── uploads/            # Archivos subidos (comprobantes)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/     # Componentes reutilizables (feature gates, banner)
│   │   ├── context/        # Contextos (Auth, Plan)
│   │   ├── layouts/        # Layouts (AppLayout)
│   │   ├── pages/          # Páginas de la aplicación (incl. legales)
│   │   ├── utils/          # Utilidades (api, formatters, toast)
│   │   ├── App.jsx         # Routing
│   │   ├── main.jsx        # Punto de entrada
│   │   └── index.css       # Estilos globales + Tailwind
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── .env.example
└── README.md
```

---

## Funcionalidades

### Páginas públicas (sin autenticación)

- **Landing Page (`/`)**: presentación de la granja, catálogo y proceso de compra.
- **Formulario de compra (`/formulario-compra`)**: pedidos con subida de comprobante.
- **Planes (`/planes`)**: catálogo público de planes y servicios.
- **Legales**: `privacidad`, `terminos`, `reembolsos`, `cookies`.

### Páginas privadas (requieren autenticación)

- **Login (`/login`)**: autenticación con JWT.
- **Dashboard (`/dashboard`)**: KPIs, gráficos de ventas, últimas ventas y alertas.
- **Ventas (`/ventas`, `/ventas/nueva`)**: listado con filtros y creación con
  cálculo automático de totales e impacto en stock.
- **Productos (`/productos`)**: CRUD con alertas visuales de stock bajo.
- **Clientes (`/clientes`)**: listado, comprobantes y aprobación/rechazo.
- **Inventario (`/inventario`)**: stock actual, movimientos e historial.
- **Reportes (`/reportes`)**: ventas, inventario y clientes con exportación CSV, más
  analítica avanzada (pronóstico, afinidad, velocidad/aceleración y EOQ).
- **Mi plan (`/mi-plan`)**: plan actual, límites, uso y solicitudes de servicio.
- **Usuarios (`/usuarios`)**: solo `super_admin`, CRUD de administradores.
- **Monetización (`/admin/monetizacion`)**: solo `super_admin`, panel de organizaciones,
  suscripciones, pagos, licencias, servicios y planes.

---

## Roles y permisos

| Funcionalidad | `super_admin` | `admin_granja` |
|---------------|:-------------:|:--------------:|
| Dashboard / Ventas / Productos / Clientes / Inventario / Reportes | ✅ | ✅ |
| Gestionar usuarios | ✅ | ❌ |
| Monetización (`/admin/monetizacion`, `/api/admin/*`) | ✅ | ❌ |
| Ver plan y solicitar servicios (`/mi-plan`) | ✅ | ✅ |

El **gating por plan** es independiente del rol: ciertas funciones de analítica se
habilitan según el plan contratado (ver [Monetización](#monetización)).

---

## API

### Autenticación
- `POST /api/auth/login` — iniciar sesión
- `GET /api/auth/me` — usuario actual

### Usuarios (solo `super_admin`)
- `GET /api/users` — listar
- `POST /api/users` — crear
- `PUT|PATCH /api/users/:id` — actualizar
- `DELETE /api/users/:id` — desactivar (soft delete)

### Productos
- `GET /api/products` · `GET /api/products/categories` · `GET /api/products/:id`
- `POST /api/products` · `PUT|PATCH /api/products/:id` · `DELETE /api/products/:id`

### Clientes
- `GET /api/customers` · `GET /api/customers/pending-proof-count` · `GET /api/customers/:id`
- `POST /api/customers` · `PUT|PATCH /api/customers/:id`
- `PATCH /api/customers/:id/review-proof` — aprobar/rechazar comprobante

### Ventas
- `GET /api/sales` · `GET /api/sales/:id` · `POST /api/sales`

### Inventario
- `GET /api/inventory` · `GET /api/inventory/movements` · `POST /api/inventory/movement`

### Reportes
- `GET /api/reports/sales` · `GET /api/reports/inventory` · `GET /api/reports/customers`
- `GET /api/reports/sales/export` · `GET /api/reports/inventory/export` · `GET /api/reports/customers/export` (CSV)

### Analítica (álgebra lineal y cálculo diferencial)
- `GET /api/reports/forecast` — pronóstico de ventas (mínimos cuadrados)
- `GET /api/reports/affinity` — afinidad entre productos (similitud coseno)
- `GET /api/reports/rate` — velocidad y aceleración (1ª y 2ª derivada)
- `GET /api/reports/eoq` — cantidad económica de pedido / inventario óptimo (EOQ)

### Facturación y planes
- `GET /api/billing/plans` — catálogo público (sin auth)
- `GET /api/billing/me` — plan, features, límites, uso y órdenes de servicio
- `POST /api/billing/request` — solicitar cambio/ascenso de plan (pago manual)
- `POST /api/billing/service-request` — solicitar servicio de valor agregado

### Cookies / consentimiento
- `GET /api/cookies/consent` — lee la decisión guardada (`unknown` si no hay)
- `POST /api/cookies/consent` — guarda la decisión (`accepted`, `categories`, etc.)

### Público (sin autenticación)
- `POST /api/public/leads` — recibir formulario público con comprobante

---

## Monetización

### Planes y características

El catálogo define tres planes (**Básico**, **Profesional** e **Institucional**), sus
precios y un conjunto de **features** con `code` (p. ej. `analytics.algebra`,
`analytics.calculus`). Los límites (número de usuarios, etc.) son configurables por
plan; los precios del catálogo se administran desde el panel y no se documentan aquí.

### Gating por plan

Las rutas de analítica están protegidas por feature:
- `analytics.algebra` (`/api/reports/forecast`, `/api/reports/affinity`)
- `analytics.calculus` (`/api/reports/rate`, `/api/reports/eoq`)

Requieren plan **Profesional** o superior. Si el plan no incluye la función, el
backend responde **`402 Payment Required`** y el frontend muestra la función bloqueada
con enlace a `/planes`.

### Flujo de pago (manual)

1. El cliente solicita un plan: `POST /api/billing/request`.
2. El `super_admin` confirma el pago: `POST /api/admin/payments/:id/confirm`,
   lo que cancela la suscripción anterior y activa la nueva.
3. Si se rechaza: `POST /api/admin/payments/:id/reject`.

> La **pasarela de pago** (Wompi/PayU/PSE) está prevista como fase posterior; hoy el
> cobro es manual.

### Licencias on-premise

Las licencias se firman con `LICENSE_SECRET` (o `JWT_SECRET` si no se define) y se
verifican con `POST /api/admin/licenses/verify`; pueden revocarse con
`POST /api/admin/licenses/:id/revoke`.

### Administración (solo `super_admin`, prefijo `/api/admin`)

- `GET /api/admin/overview` — KPIs (organizaciones, suscripciones, pagos, licencias)
- `GET|POST /api/admin/organizations` · `PUT /api/admin/organizations/:id`
- `GET|POST /api/admin/subscriptions` · `PATCH /api/admin/subscriptions/:id`
- `GET /api/admin/payments` · `POST /api/admin/payments/:id/confirm|reject`
- `GET|POST /api/admin/licenses` · `POST /api/admin/licenses/verify` ·
  `POST /api/admin/licenses/:id/revoke`
- `GET /api/admin/service-orders` · `PATCH /api/admin/service-orders/:id`
- `GET /api/admin/plans` · `PATCH /api/admin/plans/:code`

---

## Cookies y consentimiento

El aviso de cookies se muestra en la primera visita (o mientras no exista una
decisión guardada) y ofrece **tres opciones**:

- **Aceptar** — activa todas las categorías opcionales.
- **Rechazar** — desactiva todas las categorías opcionales.
- **Personalizar** — permite elegir categoría por categoría.

Categorías:

| Categoría | Descripción | Estado |
|-----------|-------------|--------|
| Estrictamente necesarias | Sesión y preferencia de tema | Siempre activas |
| Preferencias | Ajustes de uso (tema, filtros) | Opcional |
| Analítica | Métricas agregadas de uso | Opcional |
| Publicidad | Contenido promocional | Opcional |

Detalles de implementación:

- La decisión se guarda en el backend mediante una **cookie técnica `cookie_consent`**
  (`httpOnly`, `SameSite=Lax`, 1 año) vía `POST /api/cookies/consent`; el estado se
  consulta con `GET /api/cookies/consent`.
- El modo puede ser `accepted`, `rejected` o `custom` (personalizado).
- En el cliente se mantiene además una marca en `localStorage` como respaldo si el
  backend no está disponible.
- Al rechazar una categoría se eliminan las cookies opcionales asociadas
  (lista ampliable en el propio controlador).
- La política completa está en `/cookies`.

---

## Variables de entorno

### Backend (`backend/.env`)

```env
PORT=3000
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=sivep
MYSQL_PORT=3306
MYSQL_SSL=false
JWT_SECRET=
JWT_EXPIRES_IN=24h
LICENSE_SECRET=
UPLOAD_PATH=./uploads
CORS_ORIGIN=
FORCE_HTTPS=false
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Genera secretos largos y aleatorios, por ejemplo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000/api
```

> Los archivos `.env` están en `.gitignore` y **nunca** deben subirse al repositorio.
> Usa los `.env.example` como plantilla.

---

## Scripts disponibles

### Backend

```bash
pnpm start                    # Producción
pnpm run dev                  # Desarrollo con watch
pnpm run db:migrate           # Migraciones base
pnpm run db:seed              # Seed inicial
pnpm run db:add-billing       # Tablas de monetización (idempotente)
pnpm run db:add-multitenant   # Aislamiento multi-tenant (idempotente)
```

### Frontend

```bash
pnpm run dev       # Desarrollo
pnpm run build     # Build de producción
pnpm run preview   # Preview del build
```

---

## UI/UX

- Diseño minimalista, limpio y profesional.
- Responsive (mobile-first), con sidebar colapsible en móvil.
- Modales para formularios y confirmaciones; toasts para notificaciones.
- Tablas con paginación, ordenamiento y filtros; badges de estado.
- Alertas visuales para stock bajo y bloqueo de funciones según el plan.
- Moneda en formato COP (`$1.234.567`) y fechas en `DD/MM/YYYY`.
- Todos los textos en español.

---

## Seguridad, privacidad y cumplimiento

### Secretos

- Jamás subir `backend/.env` ni `frontend/.env` a git (ver `.gitignore`).
- El servidor **no arranca sin `JWT_SECRET`** (falla rápido en vez de usar un valor público).
- Las claves de Cloudinary viven **solo** en el backend. Si un secreto se expone
  (chat, repo, logs), **rotarlo de inmediato** y actualizar el `.env`.
- El `LICENSE_SECRET` no debe cambiarse una vez emitidas licencias: las invalidaría.

### HTTPS en producción (obligatorio)

1. Servir el backend detrás de Nginx/Caddy con certificado TLS (Certbot/Let's Encrypt).
2. En `backend/.env`: `FORCE_HTTPS=true` (redirección 301 de HTTP a HTTPS) y
   `CORS_ORIGIN=https://su-dominio.com`.
3. En desarrollo local: `FORCE_HTTPS=false` y `CORS_ORIGIN` vacío.

Ejemplo mínimo de Nginx:

```nginx
server {
  listen 443 ssl;
  server_name su-dominio.com;
  ssl_certificate /etc/letsencrypt/live/su-dominio.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/su-dominio.com/privkey.pem;
  location /api/ { proxy_pass http://127.0.0.1:3000/api/; proxy_set_header X-Forwarded-Proto https; }
  location / { root /var/www/sivep/dist; try_files $uri /index.html; }
}
```

### Protecciones activas

- Cabeceras de seguridad con `@fastify/helmet` (HSTS, anti-clickjacking, no-sniff, etc.).
- Rate-limit global (500 req/min) y login limitado (20 intentos/15 min por IP).
- Contraseñas con bcrypt (12 rondas), JWT de 24 h, mensajes de login genéricos y
  control de acceso por rol y por plan.
- Subidas validadas por tipo y tamaño (10 MB); imágenes en Cloudinary y URLs
  absolutas en BD.
- Aislamiento multi-tenant a nivel de consulta (ver sección correspondiente).

### Privacidad y datos (Colombia)

- Páginas legales: `/privacidad`, `/terminos`, `/reembolsos`, `/cookies`
  (Ley 1581/2012, Decreto 1377/2013, Ley 1480/2011 y lineamientos de la SIC).
- El formulario público exige la aceptación de la política (autorización previa,
  expresa e informada) y solicita solo los datos necesarios.
- El aviso de cookies permite aceptar, rechazar o personalizar las categorías
  opcionales; el consentimiento se registra y respeta.
- Operativo pendiente: copias de seguridad cifradas de MySQL y procedimiento
  formal de supresión de datos.

---

## Licencia

Desarrollado para la Granja El Cairo — Universidad Nacional de Colombia,
Sede Orinoquía.

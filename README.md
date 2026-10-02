# SIVEP - Sistema de Inventario, Ventas y Producción
## Granja El Cairo - Universidad Nacional de Colombia Sede Orinoquía

Sistema completo de gestión para la Granja El Cairo con arquitectura cliente-servidor.

### Stack Tecnológico

**Backend:**
- Node.js con JavaScript (ES Modules)
- Fastify como framework HTTP
- MySQL (mysql2 con promesas)
- JWT para autenticación
- bcryptjs para hash de contraseñas
- multer para upload de archivos
- CORS, dotenv, Joi para validaciones

**Frontend:**
- React 18 con JavaScript
- Vite como bundler
- Tailwind CSS para estilos
- React Router DOM v6 para routing
- Axios para peticiones HTTP
- Recharts para gráficos
- Lucide React para iconos

### Paleta de Colores UNAL
- Primario: #8B1E3F (Granate)
- Acento: #5B8C4E (Verde Oliva)
- Secundario: #4A4A4A (Gris Oscuro)
- Fondo: #F8F9FA
- Tipografía: Inter

---

## Instalación y Configuración

### Prerrequisitos
- Node.js 18+
- MySQL 8.0+
- npm o yarn

### 1. Base de Datos MySQL

```sql
CREATE DATABASE sivep CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de MySQL
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

El servidor correrá en `http://localhost:3000`

### 3. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

La aplicación correrá en `http://localhost:5173`

---

## Credenciales Iniciales

**Super Administrador:**
- Email: `superadmin@sivep.unal.edu.co`
- Password: `Sivep2026*Admin`

---

## Estructura del Proyecto

```
SIVEP/
├── backend/
│   ├── src/
│   │   ├── config/         # Configuración de base de datos
│   │   ├── controllers/    # Controladores de cada entidad
│   │   ├── database/       # Migraciones y seeds
│   │   ├── middleware/     # Middlewares (auth, roles)
│   │   ├── routes/         # Rutas de la API
│   │   ├── utils/          # Utilidades y helpers
│   │   ├── validators/     # Esquemas de validación Joi
│   │   └── server.js       # Punto de entrada
│   ├── uploads/            # Archivos subidos (comprobantes)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/     # Componentes reutilizables
│   │   ├── context/        # Contextos (Auth)
│   │   ├── layouts/        # Layouts (AppLayout)
│   │   ├── pages/          # Páginas de la aplicación
│   │   ├── utils/          # Utilidades (api, formatters, toast)
│   │   ├── App.jsx         # Componente principal con routing
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

## Funcionalidades Principales

### Páginas Públicas (sin autenticación)
- **Landing Page (/)**: Presentación de la Granja El Cairo, catálogo de productos, proceso de compra
- **Formulario de Compra (/formulario-compra)**: Formulario público para pedidos con upload de comprobante

### Páginas Privadas (requieren autenticación)
- **Login (/login)**: Autenticación con JWT
- **Dashboard (/dashboard)**: KPIs, gráficos de ventas, últimas ventas, alertas
- **Ventas (/ventas)**: Listado con filtros, ver detalle
- **Nueva Venta (/ventas/nueva)**: Crear venta con selección de cliente/productos, cálculo automático
- **Productos (/productos)**: CRUD completo, alertas visuales de stock bajo
- **Clientes (/clientes)**: Listado con filtros, modal para ver comprobantes, aprobar/rechazar
- **Inventario (/inventario)**: Stock actual, registrar movimientos (entrada/salida/ajuste), historial
- **Reportes (/reportes)**: Reportes de ventas, inventario, clientes con exportación CSV
- **Usuarios (/usuarios)**: Solo Super Admin - CRUD de administradores de granja

---

## API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Obtener usuario actual

### Usuarios (Solo Super Admin)
- `GET /api/users` - Listar usuarios
- `POST /api/users` - Crear usuario
- `PUT/PATCH /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Desactivar usuario (soft delete)

### Productos
- `GET /api/products` - Listar productos
- `GET /api/products/categories` - Obtener categorías
- `GET /api/products/:id` - Obtener producto
- `POST /api/products` - Crear producto
- `PUT/PATCH /api/products/:id` - Actualizar producto
- `DELETE /api/products/:id` - Desactivar producto

### Clientes
- `GET /api/customers` - Listar clientes
- `GET /api/customers/pending-proof-count` - Contar comprobantes pendientes
- `GET /api/customers/:id` - Obtener cliente
- `POST /api/customers` - Crear cliente
- `PUT/PATCH /api/customers/:id` - Actualizar cliente
- `PATCH /api/customers/:id/review-proof` - Aprobar/rechazar comprobante

### Ventas
- `GET /api/sales` - Listar ventas
- `GET /api/sales/:id` - Obtener venta con items
- `POST /api/sales` - Crear venta (actualiza stock y crea movimiento)

### Inventario
- `GET /api/inventory` - Listar productos con stock
- `GET /api/inventory/movements` - Historial de movimientos
- `POST /api/inventory/movement` - Registrar movimiento

### Reportes
- `GET /api/reports/sales` - Reporte de ventas
- `GET /api/reports/inventory` - Reporte de inventario
- `GET /api/reports/customers` - Reporte de clientes
- `GET /api/reports/sales/export` - Exportar ventas CSV
- `GET /api/reports/inventory/export` - Exportar inventario CSV
- `GET /api/reports/customers/export` - Exportar clientes CSV

### Público (Sin autenticación)
- `POST /api/public/leads` - Recibir formulario público con comprobante

---

## Roles y Permisos

| Funcionalidad | Super Admin | Admin Granja |
|---------------|-------------|--------------|
| Ver Dashboard | ✅ | ✅ |
| Gestionar Ventas | ✅ | ✅ |
| Gestionar Productos | ✅ | ✅ |
| Gestionar Clientes | ✅ | ✅ |
| Gestionar Inventario | ✅ | ✅ |
| Ver Reportes | ✅ | ✅ |
| Gestionar Usuarios | ✅ | ❌ |

---

## Variables de Entorno

### Backend (.env)
```env
PORT=3000
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=tu_password
MYSQL_DATABASE=sivep
JWT_SECRET=tu_secreto_jwt_muy_seguro
JWT_EXPIRES_IN=24h
UPLOAD_PATH=./uploads
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3000/api
```

---

## Scripts Disponibles

### Backend
```bash
npm start        # Producción
npm run dev      # Desarrollo con watch
npm run db:migrate  # Ejecutar migraciones
npm run db:seed     # Ejecutar seed inicial
```

### Frontend
```bash
npm run dev      # Desarrollo
npm run build    # Build para producción
npm run preview  # Preview del build
```

---

## Características de UI/UX

- Diseño minimalista, limpio y profesional
- Responsive (mobile-first)
- Sidebar colapsible en móvil
- Modales para formularios y confirmaciones
- Tablas con paginación, ordenamiento y filtros
- Badges de estado con código de colores
- Alertas visuales para stock bajo
- Toasts para notificaciones
- Formateo de moneda COP ($1.234.567)
- Fechas en formato DD/MM/YYYY
- Todos los textos en español

---

## Seguridad, privacidad y cumplimiento

### Secretos
- Jamás subir `backend/.env` a git (ver `.gitignore`). Usar `backend/.env.example` como plantilla.
- El servidor **no arranca sin `JWT_SECRET`** (falla rápido en vez de usar un valor público).
- Las claves de Cloudinary viven **solo** en el backend. Si un secreto se expone (chat, repo, logs), **rotarlo de inmediato** en el panel de Cloudinary y actualizar el `.env`.
- Tras instalar como super_admin inicial, crear los administradores de granja y usar cuentas nominales.

### HTTPS en producción (obligatorio)
1. Servir el backend detrás de Nginx/Caddy con certificado TLS (p. ej. Certbot/Let's Encrypt).
2. En `backend/.env`: `FORCE_HTTPS=true` (redirección 301 de HTTP a HTTPS) y `CORS_ORIGIN=https://su-dominio.com`.
3. En desarrollo local ambos quedan desactivados (`FORCE_HTTPS=false`, `CORS_ORIGIN` vacío).

Ejemplo mínimo Nginx:
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
- Contraseñas con bcrypt (12 rondas), JWT de 24 h, mensajes de login genéricos, acceso por roles.
- Subidas validadas por tipo y tamaño (10 MB); imágenes en Cloudinary, URLs absolutas en BD.

### Privacidad y datos (Colombia)
- Páginas públicas: `/privacidad`, `/terminos`, `/reembolsos`, `/cookies` (Ley 1581/2012, Decreto 1377/2013, Ley 1480/2011, SIC).
- El formulario público exige aceptación de la política (autorización previa, expresa e informada) y pide solo datos necesarios.
- No hay cookies de rastreo ni analítica: solo almacenamiento técnico (sesión, tema, aviso). Verdict: no se requiere banner de consentimiento bloqueante; el aviso es informativo.
- Derechos ARCO: canal `granjaelcairo@unal.edu.co`. Encargado de imágenes: Cloudinary.
- Operativo pendiente: copias de seguridad cifradas de MySQL + procedimiento de supresión de datos.

---

## Licencia

Desarrollado para la Granja El Cairo - Universidad Nacional de Colombia Sede Orinoquía
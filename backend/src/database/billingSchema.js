// ============================================================================
// ESQUEMA DE MONETIZACIÓN DE SIVEP — planes, features y suscripciones
// ----------------------------------------------------------------------------
// ¿POR QUÉ un módulo aparte?
//   El modelo comercial (planes, features, suscripciones, licencias y servicios)
//   se define UNA sola vez aquí y lo consumen dos rutas de mantenimiento:
//     - `migrate.js` (instalación desde cero)
//     - `add-billing-schema.js` (bases de datos YA existentes)
//   Centralizarlo evita tener el mismo SQL duplicado y desincronizado.
//
// DISEÑO (multi-tenant):
//   Una `organization` es una cuenta de cliente (una granja, una cooperativa o
//   la universidad con varias sedes). Cada `user` pertenece a una organización
//   (`users.organization_id`). El acceso a funciones se decide por la
//   SUSCRIPCIÓN activa de la organización y las FEATURES de su PLAN.
//
//   En vez de "if plan === profesional" regado por el código, existe un
//   CATÁLOGO DE FEATURES (`feature_catalog`) y una tabla puente
//   (`plan_features`) que dice qué incluye cada plan y con qué límite. Así se
//   agregan planes nuevos sin tocar la lógica de negocio.
// ============================================================================

// ---------------------------------------------------------------------------
// 1) MIGRACIONES: creación idempotente de tablas (CREATE TABLE IF NOT EXISTS).
//    Se concatenan en migrate.js y las ejecuta add-billing-schema.js.
// ---------------------------------------------------------------------------
export const billingMigrations = [
  // Cuentas de cliente (tenant). Habilita multi-sede para el plan Institucional.
  `CREATE TABLE IF NOT EXISTS organizations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    nit VARCHAR(50) NULL,
    city VARCHAR(120) NULL,
    contact_email VARCHAR(255) NULL,
    contact_phone VARCHAR(50) NULL,
    notes TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_organizations_name (name),
    INDEX idx_organizations_is_active (is_active)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Catálogo de capacidades del software. `kind` distingue features lógicas
  // (activada/no) de features con LÍMITE numérico (p. ej. nº de usuarios).
  `CREATE TABLE IF NOT EXISTS feature_catalog (
    code VARCHAR(60) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(60) NOT NULL,
    kind ENUM('boolean', 'limit') NOT NULL DEFAULT 'boolean',
    description VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Planes comerciales (SaaS). El precio se expresa por ciclo de facturación.
  `CREATE TABLE IF NOT EXISTS plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(255) NULL,
    price_monthly DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    price_yearly DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Puente plan ↔ feature. `limit_value` se usa cuando feature_catalog.kind
  // es 'limit' (NULL = ilimitado); para features booleanas se ignora.
  `CREATE TABLE IF NOT EXISTS plan_features (
    plan_id INT NOT NULL,
    feature_code VARCHAR(60) NOT NULL,
    limit_value INT NULL,
    PRIMARY KEY (plan_id, feature_code),
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
    FOREIGN KEY (feature_code) REFERENCES feature_catalog(code) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Suscripción de una organización a un plan. El estado controla el acceso.
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    plan_id INT NOT NULL,
    status ENUM('trialing', 'active', 'past_due', 'canceled', 'expired') NOT NULL DEFAULT 'active',
    billing_cycle ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    current_period_start DATE NOT NULL,
    current_period_end DATE NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_subscriptions_org (organization_id),
    INDEX idx_subscriptions_status (status),
    INDEX idx_subscriptions_period (current_period_end)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Pagos y SOLICITUDES de cambio de plan. Con pago manual, el super_admin
  // registra el pago (status 'pagado') y activa la suscripción. Una solicitud
  // del cliente queda con status 'pendiente'. La pasarela (fase 6) llenará
  // `gateway_ref` desde su webhook.
  `CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    subscription_id INT NULL,
    plan_code VARCHAR(40) NOT NULL,
    billing_cycle ENUM('monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    method ENUM('manual', 'wompi', 'epayco', 'mercadopago') NOT NULL DEFAULT 'manual',
    status ENUM('pendiente', 'pagado', 'rechazado', 'cancelado') NOT NULL DEFAULT 'pendiente',
    reference VARCHAR(80) NULL,
    gateway_ref VARCHAR(120) NULL,
    notes TEXT NULL,
    paid_at TIMESTAMP NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_payments_org (organization_id),
    INDEX idx_payments_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Licencias on-premise (venta perpetua + mantenimiento). Se emiten desde el
  // panel de administración (fase 5); la tabla queda lista desde ya.
  `CREATE TABLE IF NOT EXISTS licenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    license_key VARCHAR(120) NOT NULL UNIQUE,
    plan_code VARCHAR(40) NOT NULL,
    type ENUM('perpetual', 'subscription') NOT NULL DEFAULT 'perpetual',
    seats INT NULL,
    issued_at DATE NOT NULL,
    expires_at DATE NULL,
    status ENUM('active', 'expired', 'revoked') NOT NULL DEFAULT 'active',
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    INDEX idx_licenses_org (organization_id),
    INDEX idx_licenses_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Catálogo de servicios de valor agregado (upselling).
  `CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(255) NULL,
    price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  // Órdenes de servicios contratados por una organización.
  `CREATE TABLE IF NOT EXISTS service_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    organization_id INT NOT NULL,
    service_id INT NOT NULL,
    status ENUM('solicitado', 'en_proceso', 'completado', 'cancelado') NOT NULL DEFAULT 'solicitado',
    amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    notes TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_service_orders_org (organization_id),
    INDEX idx_service_orders_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
];

// ---------------------------------------------------------------------------
// 2) CATÁLOGO DE FEATURES (capacidades del producto)
//    `analytics.calculus` es el módulo de cálculo diferencial (ritmo + EOQ),
//    diferenciador del plan Profesional.
// ---------------------------------------------------------------------------
export const featureCatalog = [
  { code: "core.inventory", name: "Gestión de inventario", category: "Operación", kind: "boolean", description: "Stock, movimientos e historial", sort_order: 10 },
  { code: "core.sales", name: "Ventas", category: "Operación", kind: "boolean", description: "Registro de ventas y facturación", sort_order: 11 },
  { code: "core.customers", name: "Clientes", category: "Operación", kind: "boolean", description: "Gestión de clientes y comprobantes", sort_order: 12 },
  { code: "core.products", name: "Productos", category: "Operación", kind: "boolean", description: "Catálogo de productos", sort_order: 13 },
  { code: "reports.basic", name: "Reportes básicos", category: "Reportes", kind: "boolean", description: "Reportes de ventas, inventario y clientes con exportación CSV", sort_order: 20 },
  { code: "reports.advanced", name: "Reportes avanzados", category: "Reportes", kind: "boolean", description: "Analítica avanzada y series de tiempo", sort_order: 21 },
  { code: "analytics.algebra", name: "Proyecciones (Álgebra lineal)", category: "Analítica", kind: "boolean", description: "Pronóstico de ventas y afinidad de productos", sort_order: 30 },
  { code: "analytics.calculus", name: "Ritmo y optimización (Cálculo diferencial)", category: "Analítica", kind: "boolean", description: "Velocidad/aceleración de ventas y pedido óptimo (EOQ)", sort_order: 31 },
  { code: "public.form", name: "Formulario público personalizado", category: "Crecimiento", kind: "boolean", description: "Captación de pedidos desde la web", sort_order: 40 },
  { code: "multisite", name: "Múltiples sedes", category: "Escala", kind: "boolean", description: "Varias granjas bajo una misma cuenta", sort_order: 50 },
  { code: "api.access", name: "Acceso por API", category: "Integración", kind: "boolean", description: "Integración con sistemas externos", sort_order: 60 },
  { code: "support.email", name: "Soporte por email", category: "Soporte", kind: "boolean", description: "Atención por correo", sort_order: 70 },
  { code: "support.priority", name: "Soporte prioritario", category: "Soporte", kind: "boolean", description: "Atención preferencial", sort_order: 71 },
  { code: "support.sla", name: "SLA garantizado", category: "Soporte", kind: "boolean", description: "Acuerdo de nivel de servicio", sort_order: 72 },
  { code: "limit.users", name: "Usuarios incluidos", category: "Límites", kind: "limit", description: "Número máximo de usuarios activos (NULL = ilimitado)", sort_order: 90 },
];

// ---------------------------------------------------------------------------
// 3) CATÁLOGO DE PLANES (SaaS). `features` mapea code → limit_value.
//    Los precios son de referencia (COP) y se ajustan desde el panel admin.
// ---------------------------------------------------------------------------
const BASIC_FEATURES = {
  "core.inventory": null,
  "core.sales": null,
  "core.customers": null,
  "core.products": null,
  "reports.basic": null,
  "support.email": null,
  "limit.users": 2,
};

const PROFESSIONAL_FEATURES = {
  ...BASIC_FEATURES,
  "analytics.algebra": null,
  "analytics.calculus": null,
  "reports.advanced": null,
  "public.form": null,
  "support.email": null,
  "support.priority": null,
  "limit.users": 5,
};

const INSTITUTIONAL_FEATURES = {
  ...PROFESSIONAL_FEATURES,
  multisite: null,
  "api.access": null,
  "support.sla": null,
  "limit.users": null, // ilimitado
};

export const plansCatalog = [
  {
    code: "basic",
    name: "Básico",
    description: "Pequeños productores",
    price_monthly: 200000,
    price_yearly: 2000000,
    sort_order: 1,
    features: BASIC_FEATURES,
  },
  {
    code: "professional",
    name: "Profesional",
    description: "Granjas medianas y cooperativas",
    price_monthly: 550000,
    price_yearly: 5500000,
    sort_order: 2,
    features: PROFESSIONAL_FEATURES,
  },
  {
    code: "institutional",
    name: "Institucional",
    description: "Universidades, gobiernos y multi-sede",
    price_monthly: 1500000,
    price_yearly: 15000000,
    sort_order: 3,
    features: INSTITUTIONAL_FEATURES,
  },
];

// ---------------------------------------------------------------------------
// 4) SERVICIOS DE VALOR AGREGADO (upselling).
// ---------------------------------------------------------------------------
export const servicesCatalog = [
  { code: "implementation", name: "Implementación y capacitación", description: "Instalación en sitio, carga de inventario inicial y capacitación del personal", price: 800000, sort_order: 1 },
  { code: "data-migration", name: "Migración de datos", description: "Importación de datos antiguos (Excel, papel) al sistema", price: 400000, sort_order: 2 },
  { code: "custom-report", name: "Reporte personalizado", description: "Desarrollo de un reporte a la medida", price: 600000, sort_order: 3 },
];

// ---------------------------------------------------------------------------
// 5) RUTINA IDEMPOTENTE: agrega users.organization_id si falta.
//    CREATE TABLE IF NOT EXISTS no altera tablas ya creadas, por eso este paso
//    se hace aparte, comprobando INFORMATION_SCHEMA.
// ---------------------------------------------------------------------------
export async function ensureUsersOrganizationColumn(connection) {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'organization_id'`,
  );
  if (columns.length > 0) return false;

  await connection.query(
    `ALTER TABLE users ADD COLUMN organization_id INT NULL AFTER granja_asignada`,
  );
  // La FK se agrega después porque organizations debe existir primero.
  await connection.query(
    `ALTER TABLE users ADD CONSTRAINT fk_users_organization
     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// 6) SEED del catálogo (features, planes, plan_features y servicios).
//    Totalmente idempotente: se puede correr muchas veces sin duplicar.
// ---------------------------------------------------------------------------
export async function seedBillingCatalog(connection) {
  for (const f of featureCatalog) {
    await connection.query(
      `INSERT INTO feature_catalog (code, name, category, kind, description, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), category = VALUES(category), kind = VALUES(kind),
         description = VALUES(description), sort_order = VALUES(sort_order)`,
      [f.code, f.name, f.category, f.kind, f.description, f.sort_order],
    );
  }

  for (const p of plansCatalog) {
    await connection.query(
      `INSERT INTO plans (code, name, description, price_monthly, price_yearly, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), description = VALUES(description),
         price_monthly = VALUES(price_monthly), price_yearly = VALUES(price_yearly),
         sort_order = VALUES(sort_order)`,
      [p.code, p.name, p.description, p.price_monthly, p.price_yearly, p.sort_order],
    );

    const [[planRow]] = await connection.query(
      "SELECT id FROM plans WHERE code = ?",
      [p.code],
    );
    for (const [featureCode, limitValue] of Object.entries(p.features)) {
      await connection.query(
        `INSERT INTO plan_features (plan_id, feature_code, limit_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE limit_value = VALUES(limit_value)`,
        [planRow.id, featureCode, limitValue],
      );
    }
  }

  for (const s of servicesCatalog) {
    await connection.query(
      `INSERT INTO services (code, name, description, price, sort_order)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), description = VALUES(description), price = VALUES(price),
         sort_order = VALUES(sort_order)`,
      [s.code, s.name, s.description, s.price, s.sort_order],
    );
  }
}

// ---------------------------------------------------------------------------
// 7) Organización por defecto para no dejar la instalación "sin cuenta".
//    Crea la organización, enlaza los usuarios sin organización y le da una
//    suscripción Institucional activa. Así, tras migrar, el sistema sigue
//    funcionando con TODAS las funciones (incluido el cálculo diferencial).
// ---------------------------------------------------------------------------
export async function ensureDefaultOrganization(connection) {
  const DEFAULT_NAME = "Granja El Cairo - UNAL Orinoquía";

  const [existing] = await connection.query(
    "SELECT id FROM organizations WHERE name = ? LIMIT 1",
    [DEFAULT_NAME],
  );
  let organizationId = existing[0]?.id;

  if (!organizationId) {
    const [res] = await connection.query(
      `INSERT INTO organizations (name, city, contact_email, is_active)
       VALUES (?, ?, ?, TRUE)`,
      [DEFAULT_NAME, "Arauca", "granjaelcairo@unal.edu.co"],
    );
    organizationId = res.insertId;
  }

  // Enlaza usuarios que aún no tienen organización (excepto si ya la tienen).
  await connection.query(
    "UPDATE users SET organization_id = ? WHERE organization_id IS NULL",
    [organizationId],
  );

  // Suscripción activa (Institucional) si la organización no tiene ninguna.
  const [subs] = await connection.query(
    "SELECT id FROM subscriptions WHERE organization_id = ? LIMIT 1",
    [organizationId],
  );
  if (subs.length === 0) {
    const [[plan]] = await connection.query(
      "SELECT id, price_yearly FROM plans WHERE code = 'institutional' LIMIT 1",
    );
    if (plan) {
      const start = new Date();
      const end = new Date();
      end.setFullYear(end.getFullYear() + 1);
      const toDate = (d) => d.toISOString().split("T")[0];
      await connection.query(
        `INSERT INTO subscriptions
           (organization_id, plan_id, status, billing_cycle, amount,
            current_period_start, current_period_end)
         VALUES (?, ?, 'active', 'yearly', ?, ?, ?)`,
        [organizationId, plan.id, plan.price_yearly, toDate(start), toDate(end)],
      );
    }
  }

  return organizationId;
}

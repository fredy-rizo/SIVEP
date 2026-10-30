import Joi from "joi";

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "El email debe tener un formato válido",
    "any.required": "El email es obligatorio",
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": "La contraseña debe tener al menos 6 caracteres",
    "any.required": "La contraseña es obligatoria",
  }),
});

export const userCreateSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  full_name: Joi.string().min(2).max(255).required(),
  role: Joi.string().valid("super_admin", "admin_granja").required(),
  granja_asignada: Joi.string().max(255).allow("", null),
  organization_id: Joi.number().integer().positive().allow(null),
  is_active: Joi.boolean().default(true),
});

export const userUpdateSchema = Joi.object({
  email: Joi.string().email(),
  full_name: Joi.string().min(2).max(255),
  role: Joi.string().valid("super_admin", "admin_granja"),
  granja_asignada: Joi.string().max(255).allow("", null),
  organization_id: Joi.number().integer().positive().allow(null),
  is_active: Joi.boolean(),
}).min(1);

export const productSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  unit: Joi.string().min(1).max(50).required(),
  current_price: Joi.number().min(0).required(),
  current_stock: Joi.number().integer().min(0).default(0),
  min_stock: Joi.number().integer().min(0).default(0),
  category: Joi.string().min(1).max(100).required(),
  description: Joi.string().allow("", null),
  image_url: Joi.string().uri().allow("", null),
  is_active: Joi.boolean().default(true),
});

export const productUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(255),
  unit: Joi.string().min(1).max(50),
  current_price: Joi.number().min(0),
  current_stock: Joi.number().integer().min(0),
  min_stock: Joi.number().integer().min(0),
  category: Joi.string().min(1).max(100),
  description: Joi.string().allow("", null),
  image_url: Joi.string().uri().allow("", null),
  is_active: Joi.boolean(),
}).min(1);

export const customerSchema = Joi.object({
  document_type: Joi.string()
    .valid("CC", "CE", "TI", "NIT", "PASSPORT")
    .default("CC"),
  document_number: Joi.string().min(1).max(50).required(),
  full_name: Joi.string().min(2).max(255).required(),
  phone: Joi.string().max(50).allow("", null),
  email: Joi.string().email().allow("", null),
  address: Joi.string().allow("", null),
  origin: Joi.string().valid("manual", "formulario_publico").default("manual"),
});

export const customerUpdateSchema = Joi.object({
  document_type: Joi.string().valid("CC", "CE", "TI", "NIT", "PASSPORT"),
  document_number: Joi.string().min(1).max(50),
  full_name: Joi.string().min(2).max(255),
  phone: Joi.string().max(50).allow("", null),
  email: Joi.string().email().allow("", null),
  address: Joi.string().allow("", null),
}).min(1);

export const saleSchema = Joi.object({
  customer_id: Joi.number().integer().positive().required(),
  sale_date: Joi.date()
    .iso()
    .default(() => new Date()),
  payment_type: Joi.string().valid("contado", "credito").default("contado"),
  payment_status: Joi.string()
    .valid("pagado", "pendiente")
    .default("pendiente"),
  notes: Joi.string().allow("", null),
  items: Joi.array()
    .items(
      Joi.object({
        product_id: Joi.number().integer().positive().required(),
        quantity: Joi.number().integer().positive().required(),
        unit_price: Joi.number().min(0).required(),
      }),
    )
    .min(1)
    .required(),
});

export const inventoryMovementSchema = Joi.object({
  product_id: Joi.number().integer().positive().required(),
  movement_type: Joi.string().valid("entrada", "salida", "ajuste").required(),
  quantity: Joi.number().integer().positive().required(),
  reason: Joi.string().min(1).max(255).required(),
  reference_type: Joi.string()
    .valid("venta", "compra", "ajuste_manual", "devolucion", "otro")
    .default("otro"),
  reference_id: Joi.number().integer().positive().allow(null),
});

export const reportFiltersSchema = Joi.object({
  start_date: Joi.date().iso(),
  end_date: Joi.date().iso().min(Joi.ref("start_date")),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

// Comprobante de pago del formulario público EN LÍNEA. El cliente ya pagó en
// la página de la UNAL y sube el PDF de eCollect. El efectivo NO se registra
// aquí: usa `POST /api/public/cash-claims`, que exige validación administrativa
// antes de descontar stock.
export const publicLeadSchema = Joi.object({
  payment_mode: Joi.string().valid("online").required().messages({
    "any.only":
      "El pago en efectivo se registra en el formulario de solicitud de efectivo",
  }),
  accepts_policy: Joi.boolean().valid(true).required().messages({
    "any.only": "Debe aceptar la política de privacidad para continuar",
    "any.required": "Debe aceptar la política de privacidad para continuar",
  }),
});

// Solicitud de compra en efectivo. A diferencia de `publicLeadSchema`, aquí el
// comprador describe los productos que pagó en caja. Los precios NO se aceptan
// del cliente: el controlador los toma del catálogo y calcula el total. El
// comprobante (foto o PDF) se valida en el multipart, no en este schema.
export const cashClaimSchema = Joi.object({
  cash_receipt_code: Joi.string().trim().min(2).max(50).required().messages({
    "string.empty": "El código de caja es obligatorio",
    "any.required": "El código de caja es obligatorio",
  }),
  document_type: Joi.string()
    .valid("CC", "CE", "TI", "NIT", "PASSPORT")
    .default("CC"),
  document_number: Joi.string().trim().min(3).max(50).required().messages({
    "string.empty": "El número de documento es obligatorio",
    "any.required": "El número de documento es obligatorio",
  }),
  full_name: Joi.string().trim().min(3).max(255).required().messages({
    "string.empty": "El nombre completo es obligatorio",
    "any.required": "El nombre completo es obligatorio",
  }),
  phone: Joi.string().trim().max(50).allow("", null),
  email: Joi.string().email().allow("", null),
  purchase_date: Joi.date().iso().max("now").required().messages({
    "date.base": "La fecha de compra no es válida",
    "date.max": "La fecha de compra no puede ser futura",
    "any.required": "La fecha de compra es obligatoria",
  }),
  declared_total: Joi.number().min(0).required().messages({
    "number.base": "El valor pagado debe ser un número",
    "any.required": "El valor pagado es obligatorio",
  }),
  notes: Joi.string().max(1000).allow("", null),
  accepts_policy: Joi.boolean().valid(true).required().messages({
    "any.only": "Debe aceptar la política de privacidad para continuar",
    "any.required": "Debe aceptar la política de privacidad para continuar",
  }),
  items: Joi.array()
    .items(
      Joi.object({
        product_id: Joi.number().integer().positive().required(),
        quantity: Joi.number().integer().positive().max(1000).required(),
      }),
    )
    .min(1)
    .required()
    .messages({
      "array.min": "Debes seleccionar al menos un producto",
      "any.required": "Debes seleccionar al menos un producto",
    }),
});

// Rechazo de una solicitud: el motivo queda visible para el comprador.
export const cashClaimRejectSchema = Joi.object({
  reason: Joi.string().trim().min(3).max(1000).required().messages({
    "string.empty": "Debes indicar el motivo del rechazo",
    "any.required": "Debes indicar el motivo del rechazo",
  }),
});

// Consentimiento de cookies: el frontend envía { accepted: true | false }.
// Solo valida el body del nuevo endpoint; no altera ningún otro schema.
export const cookieConsentSchema = Joi.object({
  // Decisión rápida: aceptar o rechazar todas las categorías opcionales.
  accepted: Joi.boolean(),
  // Decisión personalizada por categoría (necesarias siempre activas).
  categories: Joi.object({
    preferences: Joi.boolean(),
    analytics: Joi.boolean(),
    marketing: Joi.boolean(),
  }),
})
  .or("accepted", "categories")
  .messages({
    "object.missing": 'Debe enviar "accepted" o "categories"',
  });

// Solicitud de cambio/ascenso de plan (pago manual). `notes` es opcional para
// que el cliente deje datos de contacto o requerimientos. `coupon_code` aplica
// un descuento si el cupón es válido.
export const billingRequestSchema = Joi.object({
  plan_code: Joi.string().max(40).required(),
  billing_cycle: Joi.string().valid("monthly", "yearly").default("monthly"),
  coupon_code: Joi.string().max(40).allow("", null),
  notes: Joi.string().max(1000).allow("", null),
});

// ---------------------------------------------------------------------------
// Administración de monetización (solo super_admin)
// ---------------------------------------------------------------------------
export const organizationSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  nit: Joi.string().max(50).allow("", null),
  city: Joi.string().max(120).allow("", null),
  contact_email: Joi.string().email().allow("", null),
  contact_phone: Joi.string().max(50).allow("", null),
  notes: Joi.string().max(2000).allow("", null),
  is_active: Joi.boolean().default(true),
});

export const organizationUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(255),
  nit: Joi.string().max(50).allow("", null),
  city: Joi.string().max(120).allow("", null),
  contact_email: Joi.string().email().allow("", null),
  contact_phone: Joi.string().max(50).allow("", null),
  notes: Joi.string().max(2000).allow("", null),
  is_active: Joi.boolean(),
}).min(1);

export const subscriptionAdminSchema = Joi.object({
  organization_id: Joi.number().integer().positive().required(),
  plan_code: Joi.string().max(40).required(),
  billing_cycle: Joi.string().valid("monthly", "yearly").default("monthly"),
  status: Joi.string()
    .valid("trialing", "active", "past_due", "canceled", "expired")
    .default("active"),
  current_period_end: Joi.date().iso().allow(null),
});

export const subscriptionUpdateSchema = Joi.object({
  plan_code: Joi.string().max(40),
  billing_cycle: Joi.string().valid("monthly", "yearly"),
  status: Joi.string().valid("trialing", "active", "past_due", "canceled", "expired"),
  current_period_end: Joi.date().iso(),
}).min(1);

export const licenseSchema = Joi.object({
  organization_id: Joi.number().integer().positive().required(),
  plan_code: Joi.string().max(40).required(),
  type: Joi.string().valid("perpetual", "subscription").default("perpetual"),
  seats: Joi.number().integer().positive().allow(null),
  expires_at: Joi.date().iso().allow(null),
  notes: Joi.string().max(2000).allow("", null),
});

export const planUpdateSchema = Joi.object({
  name: Joi.string().min(2).max(120),
  description: Joi.string().max(255).allow("", null),
  price_monthly: Joi.number().min(0),
  price_yearly: Joi.number().min(0),
  trial_days: Joi.number().integer().min(0).max(365),
  is_active: Joi.boolean(),
}).min(1);

// Creación de un plan a medida (código único + precios + features).
export const planCreateSchema = Joi.object({
  code: Joi.string()
    .pattern(/^[a-z0-9][a-z0-9_-]{1,39}$/)
    .required()
    .messages({
      "string.pattern.base":
        "El código solo admite minúsculas, números, guion y guion bajo (2-40 caracteres)",
    }),
  name: Joi.string().min(2).max(120).required(),
  description: Joi.string().max(255).allow("", null),
  price_monthly: Joi.number().min(0).default(0),
  price_yearly: Joi.number().min(0).default(0),
  trial_days: Joi.number().integer().min(0).max(365).default(0),
  sort_order: Joi.number().integer().default(100),
  is_active: Joi.boolean().default(true),
  // Features incluidas: mapa code → límite (null = ilimitado/booleana).
  features: Joi.object().pattern(Joi.string().max(60), Joi.number().allow(null)),
});

// Cupones de descuento (solo super_admin).
export const couponSchema = Joi.object({
  code: Joi.string()
    .pattern(/^[A-Z0-9][A-Z0-9_-]{1,39}$/)
    .required()
    .messages({
      "string.pattern.base": "El código solo admite mayúsculas, números, guion y guion bajo",
    }),
  description: Joi.string().max(255).allow("", null),
  discount_type: Joi.string().valid("percent", "fixed").default("percent"),
  discount_value: Joi.number().min(0).required(),
  plan_code: Joi.string().max(40).allow("", null),
  max_redemptions: Joi.number().integer().min(1).allow(null),
  valid_from: Joi.date().iso().allow(null),
  valid_until: Joi.date().iso().allow(null),
  is_active: Joi.boolean().default(true),
});

export const couponUpdateSchema = Joi.object({
  description: Joi.string().max(255).allow("", null),
  discount_type: Joi.string().valid("percent", "fixed"),
  discount_value: Joi.number().min(0),
  plan_code: Joi.string().max(40).allow("", null),
  max_redemptions: Joi.number().integer().min(1).allow(null),
  valid_from: Joi.date().iso().allow(null),
  valid_until: Joi.date().iso().allow(null),
  is_active: Joi.boolean(),
}).min(1);

export const serviceOrderUpdateSchema = Joi.object({
  status: Joi.string().valid("solicitado", "en_proceso", "completado", "cancelado"),
  amount: Joi.number().min(0),
  notes: Joi.string().max(2000).allow("", null),
}).min(1);

// Solicitud de un servicio de valor agregado por parte del cliente.
export const serviceRequestSchema = Joi.object({
  service_code: Joi.string().max(40).required(),
  notes: Joi.string().max(1000).allow("", null),
});

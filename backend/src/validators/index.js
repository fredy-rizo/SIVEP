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
  is_active: Joi.boolean().default(true),
});

export const userUpdateSchema = Joi.object({
  email: Joi.string().email(),
  full_name: Joi.string().min(2).max(255),
  role: Joi.string().valid("super_admin", "admin_granja"),
  granja_asignada: Joi.string().max(255).allow("", null),
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
    .valid("CC", "CE", "NIT", "PASSPORT")
    .default("CC"),
  document_number: Joi.string().min(1).max(50).required(),
  full_name: Joi.string().min(2).max(255).required(),
  phone: Joi.string().max(50).allow("", null),
  email: Joi.string().email().allow("", null),
  address: Joi.string().allow("", null),
  origin: Joi.string().valid("manual", "formulario_publico").default("manual"),
});

export const customerUpdateSchema = Joi.object({
  document_type: Joi.string().valid("CC", "CE", "NIT", "PASSPORT"),
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

export const publicLeadSchema = Joi.object({
  document_type: Joi.string()
    .valid("CC", "CE", "NIT", "PASSPORT")
    .default("CC"),
  document_number: Joi.string().min(1).max(50).required(),
  full_name: Joi.string().min(2).max(255).required(),
  phone: Joi.string().max(50).allow("", null),
  email: Joi.string().email().allow("", null),
  products: Joi.array()
    .items(
      Joi.object({
        product_id: Joi.number().integer().positive().required(),
        product_name: Joi.string().allow("", null),
        product_unit: Joi.string().allow("", null),
        quantity: Joi.number().integer().positive().required(),
        unit_price: Joi.number().min(0).required(),
        total: Joi.number().min(0),
      }),
    )
    .min(1),
});

// Consentimiento de cookies: el frontend envía { accepted: true | false }.
// Solo valida el body del nuevo endpoint; no altera ningún otro schema.
export const cookieConsentSchema = Joi.object({
  accepted: Joi.boolean().required(),
});

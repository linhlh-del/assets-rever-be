import Joi from "joi";

export const userSchema = Joi.object({
  employee_code: Joi.string().min(3).max(20).required(),
  email: Joi.string().email().required(),
  full_name: Joi.string().min(2).max(100).required(),
  first_name: Joi.string().max(50),
  last_name: Joi.string().max(50),
  phone: Joi.string()
    .pattern(/^[0-9+\-\s()]+$/)
    .max(20),
  department_id: Joi.string().uuid(),
  job_title_id: Joi.string().uuid(),
  report_to: Joi.string().max(20),
  role: Joi.string().valid("super_admin", "it_admin", "manager", "user"),
  status: Joi.string().valid("active", "inactive", "resigned"),
});

export const assetSchema = Joi.object({
  asset_code: Joi.string().min(3).max(50).required(),
  product_name: Joi.string().min(2).max(200).required(),
  category: Joi.string()
    .valid(
      "laptop",
      "desktop",
      "monitor",
      "keyboard",
      "mouse",
      "headphone",
      "webcam",
      "phone",
      "tablet",
      "printer",
      "network",
      "server",
      "other",
    )
    .required(),
  brand: Joi.string().max(100),
  model: Joi.string().max(100),
  serial_number: Joi.string().max(100),
  specifications: Joi.object(),
  invoice_id: Joi.string().uuid(),
  purchase_price: Joi.number().positive(),
  purchase_date: Joi.date(),
  warranty_months: Joi.number().integer().min(0),
  warranty_expiry_date: Joi.date(),
  status: Joi.string().valid(
    "available",
    "in_use",
    "maintenance",
    "broken",
    "disposed",
  ),
  location: Joi.string().max(200),
  notes: Joi.string().max(1000),
});

// ← Đây là cái đang thiếu gây crash
export const invoiceSchema = Joi.object({
  invoice_number: Joi.string().min(3).max(50).required(),
  invoice_date: Joi.date().required(),
  supplier: Joi.string().max(200),
  total_amount: Joi.number().positive(),
  description: Joi.string().max(1000),
});

export const maintenanceSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  issue_description: Joi.string().min(10).max(1000).required(),
  priority: Joi.string().valid("low", "medium", "high", "critical"),
});

export const handoverSchema = Joi.object({
  to_employee_code: Joi.string().max(20).required(),
  asset_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  notes: Joi.string().max(1000),
});

export const returnSchema = Joi.object({
  asset_ids: Joi.array().items(Joi.string().uuid()).min(1).required(),
  notes: Joi.string().max(1000),
});

export const userUpdateSchema = Joi.object({
  full_name: Joi.string().min(2).max(100),
  first_name: Joi.string().max(50).allow("", null),
  last_name: Joi.string().max(50).allow("", null),
  phone: Joi.string()
    .pattern(/^[0-9+\-\s()]+$/)
    .max(20)
    .allow("", null),
  department_id: Joi.string().uuid().allow(null),
  job_title_id: Joi.string().uuid().allow(null),
  report_to: Joi.string().max(20).allow("", null),
  role: Joi.string().valid("super_admin", "it_admin", "manager", "user"),
  status: Joi.string().valid("active", "inactive", "resigned"),
});

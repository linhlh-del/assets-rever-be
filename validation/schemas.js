// validation/schemas.js — bỏ loginSchema, registerSchema
import Joi from "joi";

export const userSchema = Joi.object({
  employee_code: Joi.string().min(3).max(20).required(),
  email: Joi.string().email().required(),
  full_name: Joi.string().min(2).max(100).required(),
  phone: Joi.string()
    .pattern(/^[0-9+\-\s()]+$/)
    .max(20),
  department: Joi.string().max(100),
  team: Joi.string().max(100),
  location: Joi.string().max(50),
  role: Joi.string().valid("admin_it", "accountant", "dev", "user"),
  status: Joi.string().valid("active", "inactive", "resigned"),
});

export const assetSchema = Joi.object({
  asset_code: Joi.string().min(3).max(50).required(),
  product_name: Joi.string().min(2).max(200).required(),
  category: Joi.string().min(2).max(50).required(),
  model: Joi.string().max(100),
  color: Joi.string().max(50),
  serial_number: Joi.string().max(100),
  purchase_price: Joi.number().positive(),
  purchase_date: Joi.date(),
  status: Joi.string().valid(
    "available",
    "in_use",
    "maintenance",
    "broken",
    "disposed",
  ),
  current_user_employee_code: Joi.string().max(20),
  location: Joi.string().max(100),
  notes: Joi.string().max(1000),
});

export const invoiceSchema = Joi.object({
  invoice_number: Joi.string().min(3).max(50).required(),
  invoice_date: Joi.date().required(),
  supplier: Joi.string().max(200),
  total_amount: Joi.number().positive(),
  description: Joi.string().max(1000),
});

// validation/schemas.js — thay maintenanceSchema cũ bằng:
export const maintenanceSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  issue_description: Joi.string().min(10).max(1000).required(),
  priority: Joi.string().valid("low", "medium", "high", "critical"),
});

export const allocationSlipSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  employee_code: Joi.string().max(20).required(),
  allocation_date: Joi.date().required(),
  notes: Joi.string().max(1000),
});

export const returnSlipSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  employee_code: Joi.string().max(20).required(),
  return_date: Joi.date().required(),
  condition: Joi.string().max(50),
  notes: Joi.string().max(1000),
});

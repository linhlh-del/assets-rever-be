const Joi = require("joi");

// User validation schemas
const userSchema = Joi.object({
  employee_code: Joi.string().min(3).max(20).required(),
  email: Joi.string().email().required(),
  full_name: Joi.string().min(2).max(100).required(),
  first_name: Joi.string().min(1).max(50),
  last_name: Joi.string().min(1).max(50),
  phone: Joi.string()
    .pattern(/^[0-9+\-\s()]+$/)
    .max(20),
  department: Joi.string().max(100),
  team: Joi.string().max(100),
  location: Joi.string().max(50),
  role: Joi.string().valid("admin_it", "accountant", "dev", "user"),
  status: Joi.string().valid("active", "inactive", "resigned"),
});

// Asset validation schemas
const assetSchema = Joi.object({
  asset_code: Joi.string().min(3).max(50).required(),
  product_name: Joi.string().min(2).max(200).required(),
  category: Joi.string().min(2).max(50).required(),
  model: Joi.string().max(100),
  color: Joi.string().max(50),
  serial_number: Joi.string().max(100),
  invoice_id: Joi.string().uuid(),
  purchase_price: Joi.number().positive(),
  purchase_date: Joi.date(),
  warranty_period: Joi.number().integer().min(0),
  warranty_expiry_date: Joi.date(),
  status: Joi.string().valid(
    "available",
    "in_use",
    "maintenance",
    "broken",
    "disposed"
  ),
  current_user_employee_code: Joi.string().max(20),
  location: Joi.string().max(100),
  notes: Joi.string().max(1000),
});

// Invoice validation schemas
const invoiceSchema = Joi.object({
  invoice_number: Joi.string().min(3).max(50).required(),
  invoice_date: Joi.date().required(),
  supplier: Joi.string().max(200),
  total_amount: Joi.number().positive(),
  description: Joi.string().max(1000),
});

// Maintenance validation schemas
const maintenanceSchema = Joi.object({
  asset_id: Joi.string().uuid().required(),
  reported_by_employee_code: Joi.string().max(20).required(),
  maintenance_date: Joi.date().required(),
  issue_description: Joi.string().min(10).max(1000).required(),
  solution: Joi.string().max(1000),
  cost: Joi.number().positive(),
  technician_employee_code: Joi.string().max(20),
  status: Joi.string().valid(
    "pending",
    "in_progress",
    "completed",
    "cannot_fix"
  ),
  priority: Joi.string().valid("low", "medium", "high", "critical"),
});

// Allocation slip validation schemas
const allocationSlipSchema = Joi.object({
  slip_number: Joi.string().max(50),
  asset_id: Joi.string().uuid().required(),
  employee_code: Joi.string().max(20).required(),
  allocation_date: Joi.date().required(),
  notes: Joi.string().max(1000),
});

// Return slip validation schemas
const returnSlipSchema = Joi.object({
  slip_number: Joi.string().max(50),
  asset_id: Joi.string().uuid().required(),
  employee_code: Joi.string().max(20).required(),
  return_date: Joi.date().required(),
  condition: Joi.string().max(50),
  notes: Joi.string().max(1000),
});

// Auth validation schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const registerSchema = Joi.object({
  employee_code: Joi.string().min(3).max(20).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  full_name: Joi.string().min(2).max(100).required(),
  role: Joi.string()
    .valid("admin_it", "accountant", "dev", "user")
    .default("user"),
});

module.exports = {
  userSchema,
  assetSchema,
  invoiceSchema,
  maintenanceSchema,
  allocationSlipSchema,
  returnSlipSchema,
  loginSchema,
  registerSchema,
};

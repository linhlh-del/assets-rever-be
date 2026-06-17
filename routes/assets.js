import express from "express";
import { supabase } from "../lib/supabase.js";
import { randomUUID } from "crypto";
const router = express.Router();

// GET /api/assets - Fetch all assets with filters
router.get("/", async (req, res, next) => {
  try {
    const {
      category,
      department,
      status,
      search,
      limit = 20,
      page = 1,
    } = req.query;

    let query = supabase.from("assets").select("*", { count: "exact" });

    if (category && category !== "null") query = query.eq("category", category);
    if (department && department !== "null")
      query = query.eq("department", department);
    if (status && status !== "null") query = query.eq("status", status);
    if (search && search.trim()) {
      query = query.or(
        `asset_code.ilike.%${search}%,product_name.ilike.%${search}%,serial_number.ilike.%${search}%`,
      );
    }

    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 20;
    const offset = (pageNum - 1) * pageSize;
    query = query
      .range(offset, offset + pageSize - 1)
      .order("created_at", { ascending: false });

    const { data, count, error } = await query;
    if (error)
      return res
        .status(500)
        .json({ message: "Failed to fetch assets", error: error.message });

    res.json({
      assets: data || [],
      pagination: {
        total: count || 0,
        page: pageNum,
        limit: pageSize,
        pages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/assets/:id - Fetch single asset by UUID
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .single();
    if (error)
      return res
        .status(404)
        .json({ message: "Không tìm thấy tài sản", error: error.message });
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// GET /api/assets/:id/audit-trail - Fetch assignment history
router.get("/:id/audit-trail", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("asset_assignments")
      .select("*")
      .eq("asset_id", id)
      .order("from_date", { ascending: false });
    if (error)
      return res
        .status(500)
        .json({ message: "Lỗi lấy lịch sử", error: error.message });
    res.json(data || []);
  } catch (error) {
    next(error);
  }
});

// POST /api/assets - Create new asset
router.post("/", async (req, res, next) => {
  try {
    const newAsset = req.body;
    if (!newAsset.asset_code || !newAsset.product_name) {
      return res
        .status(400)
        .json({ message: "asset_code và product_name là bắt buộc" });
    }
    const assetData = {
      id: newAsset.id || randomUUID(),
      asset_code: newAsset.asset_code,
      product_name: newAsset.product_name,
      category: newAsset.category || "laptop",
      model: newAsset.model || null,
      color: newAsset.color || null,
      serial_number: newAsset.serial_number || null,
      purchase_price: newAsset.purchase_price || null,
      purchase_date: newAsset.purchase_date || null,
      warranty_period: newAsset.warranty_period || null,
      warranty_expiry_date: newAsset.warranty_expiry_date || null,
      status: newAsset.status || "available",
      current_user_employee_code: newAsset.current_user_employee_code || null,
      location: newAsset.location || "Kho",
      notes: newAsset.notes || null,
      created_by: newAsset.created_by || null,
      updated_by: newAsset.updated_by || null,
      department: newAsset.department || "General",
      created_at: newAsset.created_at || new Date().toISOString(),
      updated_at: newAsset.updated_at || new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("assets")
      .insert([assetData])
      .select();
    if (error)
      return res
        .status(400)
        .json({ message: "Lỗi tạo tài sản", error: error.message });
    res.status(201).json(data[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /api/assets/:id - Update asset
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("assets")
      .update(req.body)
      .eq("id", id)
      .select();
    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/assets/:id - Delete asset
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) throw error;
    res.json({ message: "Asset deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// POST /api/assets/:id/assign - Assign asset to user
router.post("/:id/assign", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { employeeCode, fullName, department, assignedBy } = req.body;

    // 1. Cập nhật asset
    const { data, error } = await supabase
      .from("assets")
      .update({ current_user_employee_code: employeeCode, status: "in_use" })
      .eq("id", id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0)
      return res.status(404).json({ message: "Asset not found" });

    // 2. Ghi lịch sử
    const { error: assignError } = await supabase
      .from("asset_assignments")
      .insert([
        {
          asset_id: id,
          employee_code: employeeCode,
          full_name: fullName || null,
          department: department || data[0].department || null,
          from_date: new Date().toISOString(),
          assigned_by: assignedBy || null,
        },
      ]);
    if (assignError)
      console.error("⚠️ Ghi lịch sử thất bại:", assignError.message);

    res.json(data[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/assets/:id/return - Return asset
router.post("/:id/return", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { returnNotes } = req.body;

    // 1. Lấy người đang dùng
    const { data: currentAsset } = await supabase
      .from("assets")
      .select("current_user_employee_code")
      .eq("id", id)
      .single();

    // 2. Cập nhật asset
    const { data, error } = await supabase
      .from("assets")
      .update({
        current_user_employee_code: null,
        status: "available",
        notes: returnNotes || null,
      })
      .eq("id", id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0)
      return res.status(404).json({ message: "Asset not found" });

    // 3. Cập nhật to_date cho assignment hiện tại
    if (currentAsset?.current_user_employee_code) {
      const { error: updateError } = await supabase
        .from("asset_assignments")
        .update({
          to_date: new Date().toISOString(),
          notes: returnNotes || null,
        })
        .eq("asset_id", id)
        .eq("employee_code", currentAsset.current_user_employee_code)
        .is("to_date", null);
      if (updateError)
        console.error("⚠️ Cập nhật lịch sử thất bại:", updateError.message);
    }

    res.json(data[0]);
  } catch (error) {
    next(error);
  }
});

export default router;

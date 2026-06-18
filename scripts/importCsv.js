import fs from "fs";
import path from "path";
import csv from "csv-parse/sync";
import dotenv from "dotenv";
import supabase from "../config/supabase.js";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function importAssets() {
  try {
    console.log("📂 Đang đọc file CSV...");

    // Đường dẫn tới file CSV
    const csvPath = path.resolve(
      __dirname,
      "../../../Donwload/assets_rows.csv",
    );

    if (!fs.existsSync(csvPath)) {
      throw new Error(`File không tồn tại: ${csvPath}`);
    }

    const fileContent = fs.readFileSync(csvPath, "utf-8");

    // Parse CSV
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(`📊 Tìm thấy ${records.length} bản ghi trong CSV`);

    if (records.length === 0) {
      console.warn("⚠️ Không có dữ liệu trong CSV");
      return;
    }

    // Transform dữ liệu cho Supabase
    const assets = records
      .map((record) => ({
        id: record.id?.trim(),
        asset_code: record.asset_code?.trim(),
        product_name: record.product_name?.trim(),
        category: record.category?.trim(),
        model: record.model?.trim(),
        color: record.color?.trim() || null,
        serial_number: record.serial_number?.trim(),
        purchase_price: record.purchase_price?.trim() || null,
        purchase_date: record.purchase_date?.trim() || null,
        warranty_period: record.warranty_period?.trim() || null,
        warranty_expiry_date: record.warranty_expiry_date?.trim() || null,
        status: (record.status?.trim() || "available").toLowerCase(),
        current_user_employee_code:
          record.current_user_employee_code?.trim() || null,
        location: record.location?.trim() || "Kho",
        notes: record.notes?.trim() || null,
        created_by: record.created_by?.trim() || null,
        updated_by: record.updated_by?.trim() || null,
        department: record.department?.trim() || "General",
      }))
      .filter((asset) => asset.id && asset.asset_code); // Lọc bỏ bản ghi trống

    console.log(
      `🚀 Đang insert dữ liệu vào Supabase... (${assets.length} bản ghi)`,
    );

    // Insert từng lô để tránh timeout
    const batchSize = 50;
    let successCount = 0;

    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(assets.length / batchSize);

      try {
        const { error } = await supabase
          .from("assets")
          .upsert(batch, { onConflict: "id" });

        if (error) {
          console.error(
            `❌ Lỗi import lô ${batchNum}/${totalBatches}:`,
            error.message,
          );
          throw error;
        }

        successCount += batch.length;
        console.log(
          `✅ Lô ${batchNum}/${totalBatches} hoàn thành (${batch.length} bản ghi)`,
        );
      } catch (batchError) {
        console.error(`❌ Lỗi xảy ra ở lô ${batchNum}:`, batchError.message);
        throw batchError;
      }
    }

    console.log(
      `\n✅ Import thành công! ${successCount} tài sản đã được thêm vào Supabase`,
    );
  } catch (error) {
    console.error("❌ Import thất bại:", error.message);
    console.error(error);
    process.exit(1);
  }
}

importAssets();

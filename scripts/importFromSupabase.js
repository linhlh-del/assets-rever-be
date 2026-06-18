import dotenv from "dotenv";
import supabase from "../config/supabase.js";

dotenv.config();

async function importAssetsFromSupabase() {
  try {
    console.log("📡 Đang kết nối tới Supabase...");

    // Bước 1: Lấy dữ liệu từ bảng users hoặc asset_template
    console.log("📥 Đang lấy dữ liệu từ Supabase...");

    const { data: sourceData, error: fetchError } = await supabase
      .from("asset_template") // Hoặc tên bảng khác nếu cần
      .select("*")
      .limit(1000);

    if (fetchError) {
      throw new Error(`Lỗi lấy dữ liệu: ${fetchError.message}`);
    }

    if (!sourceData || sourceData.length === 0) {
      console.warn("⚠️ Không tìm thấy dữ liệu trong bảng. Kiểm tra tên bảng.");
      return;
    }

    console.log(`📊 Tìm thấy ${sourceData.length} bản ghi`);

    // Bước 2: Transform dữ liệu
    const assets = sourceData
      .map((record) => ({
        id: record.id,
        asset_code: record.asset_code,
        product_name: record.product_name,
        category: record.category,
        model: record.model,
        color: record.color || null,
        serial_number: record.serial_number,
        purchase_price: record.purchase_price || null,
        purchase_date: record.purchase_date || null,
        warranty_period: record.warranty_period || null,
        warranty_expiry_date: record.warranty_expiry_date || null,
        status: (record.status || "available").toLowerCase(),
        current_user_employee_code: record.current_user_employee_code || null,
        location: record.location || "Kho",
        notes: record.notes || null,
        created_by: record.created_by || null,
        updated_by: record.updated_by || null,
        department: record.department || "General",
        created_at: record.created_at,
        updated_at: record.updated_at,
      }))
      .filter((asset) => asset.id && asset.asset_code);

    console.log(`🚀 Đang insert ${assets.length} bản ghi vào bảng assets...`);

    // Bước 3: Insert từng lô
    const batchSize = 50;
    let successCount = 0;

    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(assets.length / batchSize);

      try {
        const { data, error } = await supabase
          .from("assets")
          .upsert(batch, { onConflict: "id" });

        if (error) {
          console.error(
            `❌ Lỗi lô ${batchNum}/${totalBatches}:`,
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
      `\n✅ Import thành công! ${successCount} tài sản đã được thêm vào bảng assets`,
    );
  } catch (error) {
    console.error("❌ Import thất bại:", error.message);
    console.error(error);
    process.exit(1);
  }
}

importAssetsFromSupabase();

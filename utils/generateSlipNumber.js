export async function generateSlipNumber(client, prefix = "HND") {
  // Khoá để 2 transaction không đọc/ghi song song cùng lúc
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `slip_number_${prefix}`,
  ]);

  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const likePattern = `${prefix}-${today}-%`;

  // Lấy đúng SỐ LỚN NHẤT đã dùng cho hôm nay (không phải đếm số dòng)
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(slip_number FROM '[0-9]+$') AS INTEGER)), 0) AS max_seq
     FROM handover_slips
     WHERE slip_number LIKE $1`,
    [likePattern],
  );

  const nextSeq = parseInt(rows[0].max_seq, 10) + 1;
  const seq = String(nextSeq).padStart(4, "0");
  return `${prefix}-${today}-${seq}`;
}

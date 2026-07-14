import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { BrevoClient } = require("@getbrevo/brevo");

let _brevo = null;
function getBrevo() {
  if (!_brevo) _brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });
  return _brevo;
}

export async function verifyEmailConnection() {
  try {
    await getBrevo().account.getAccount();
    console.log("✅ Email service ready — Brevo connected");
  } catch (err) {
    console.error(
      "❌ Email service failed — check BREVO_API_KEY:",
      err.message,
    );
  }
}

function buildEmailHtml({ slip, hasAttachment }) {
  const itemsHtml = (slip.items || [])
    .map(
      (item) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">${item.asset_code || "—"}</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">${item.product_name || "—"}</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">${item.serial_number || "—"}</td>
        </tr>`,
    )
    .join("");

  const slipDateFormatted = slip.slip_date
    ? new Date(slip.slip_date).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";

  const attachmentSection = hasAttachment
    ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#92400e;">
          📎 Phiếu bàn giao đã được đính kèm trong email này. Vui lòng ký xác nhận và trả lại cho phòng IT.
        </p>
       </div>`
    : `<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:24px 0;">
        <p style="margin:0;font-size:14px;color:#0369a1;">
          📄 Phiếu bàn giao chưa có file đính kèm. Vui lòng liên hệ phòng IT để nhận bản in.
        </p>
       </div>`;

  return `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:#dc2626;padding:24px 32px;">
            <p style="margin:0;color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Rever IT Asset Management</p>
            <h1 style="margin:4px 0 0;color:#ffffff;font-size:22px;font-weight:700;">Thông báo bàn giao tài sản</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;">
              Xin chào <strong>${slip.to_user_name || slip.to_employee_code}</strong>,
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;">
              Bạn đã được bàn giao tài sản từ phòng IT Rever. Vui lòng kiểm tra thông tin bên dưới.
            </p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0 0 12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
                Thông tin phiếu bàn giao
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0;color:#6b7280;font-size:14px;width:150px;">Số phiếu</td>
                  <td style="padding:4px 0;font-size:14px;font-weight:700;color:#111827;">${slip.slip_number}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6b7280;font-size:14px;">Ngày bàn giao</td>
                  <td style="padding:4px 0;font-size:14px;color:#111827;">${slipDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6b7280;font-size:14px;">Người bàn giao</td>
                  <td style="padding:4px 0;font-size:14px;color:#111827;">${slip.issued_by_name || "—"} (IT Department)</td>
                </tr>
              </table>
            </div>
            <p style="margin:0 0 8px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
              Danh sách tài sản
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#374151;">Mã tài sản</th>
                  <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#374151;">Tên thiết bị</th>
                  <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#374151;">Serial</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            ${slip.notes ? `<p style="font-size:14px;color:#374151;margin-bottom:16px;"><strong>Ghi chú:</strong> ${slip.notes}</p>` : ""}
            ${attachmentSection}
            <p style="font-size:13px;color:#6b7280;margin-top:24px;">
              Nếu có thắc mắc, vui lòng liên hệ phòng IT qua email:
              <a href="mailto:${process.env.BREVO_SENDER_EMAIL}" style="color:#dc2626;">${process.env.BREVO_SENDER_EMAIL}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Email tự động từ hệ thống Rever IT Asset Management — Vui lòng không reply trực tiếp email này.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendHandoverEmail({ slip, toEmail, attachmentUrl }) {
  // BUG FIX: KHÔNG đặt attachment: [] mặc định
  // Brevo trả 400 "attachment is missing" khi nhận array rỗng
  // Chỉ thêm field attachment vào payload khi có file thật
  const payload = {
    sender: {
      name: process.env.BREVO_SENDER_NAME || "IT Rever",
      email: process.env.BREVO_SENDER_EMAIL,
    },
    to: [{ email: toEmail }],
    bcc: [{ email: "it@rever.vn" }],
    subject: `[Rever Assets] Phiếu bàn giao tài sản — ${slip.slip_number}`,
    htmlContent: "",
  };

  let hasAttachment = false;

  if (attachmentUrl) {
    try {
      const response = await fetch(attachmentUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const base64Content = Buffer.from(arrayBuffer).toString("base64");

      // Detect extension từ URL để đặt tên file đúng
      const urlPath = new URL(attachmentUrl).pathname;
      const ext = urlPath.split(".").pop()?.toLowerCase() || "pdf";
      const fileName = `phieu-ban-giao-${slip.slip_number}.${ext}`;

      // Chỉ thêm attachment field khi có content thật
      payload.attachment = [{ name: fileName, content: base64Content }];
      hasAttachment = true;
      console.log(
        `📎 Attachment ready: ${fileName} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`,
      );
    } catch (fetchErr) {
      // Fetch thất bại → gửi email không có đính kèm, KHÔNG crash
      console.warn(
        `⚠️ Could not fetch attachment for slip ${slip.slip_number}:`,
        fetchErr.message,
      );
    }
  }

  payload.htmlContent = buildEmailHtml({ slip, hasAttachment });

  const result = await getBrevo().transactionalEmails.sendTransacEmail(payload);
  console.log(
    `📧 Email sent to ${toEmail} for slip ${slip.slip_number} — messageId: ${result.messageId}`,
  );
  return result;
}

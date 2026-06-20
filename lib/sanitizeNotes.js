// be/lib/sanitizeNotes.js
import sanitizeHtml from "sanitize-html";

/**
 * Sanitize HTML cho trường `notes` trước khi lưu vào DB.
 *
 * Đây là lớp bảo vệ THỰC SỰ chống XSS — FE sanitize (DOMPurify trong
 * RichTextDisplay) chỉ bảo vệ trình duyệt người dùng đang xem trang, không
 * ngăn được việc ai đó gọi thẳng API (Postman, curl, script) để lưu
 * `<script>...</script>` hoặc `<img onerror=...>` vào DB. Nếu dữ liệu bẩn
 * lọt vào DB, MỌI người xem lại asset đó sau này đều có nguy cơ bị XSS dù
 * FE có sanitize lúc hiển thị, vì luôn có khả năng một nơi nào đó trong
 * code (báo cáo, export, tool khác) quên gọi sanitize trước khi render.
 *
 * Whitelist tags khớp chính xác với những gì RichTextEditor (Tiptap, FE)
 * có khả năng sinh ra: p, br, ul, ol, li. Không cho phép bất kỳ attribute
 * nào (style, class, onClick, href...) vì phạm vi hiện tại không cần.
 */
const ALLOWED_TAGS = ["p", "br", "ul", "ol", "li"];

export function sanitizeNotes(rawHtml) {
  if (!rawHtml || typeof rawHtml !== "string") return null;

  const clean = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {}, // không cho phép attribute nào trên bất kỳ thẻ nào
    disallowedTagsMode: "discard", // loại bỏ hẳn thẻ lạ, không giữ lại nội dung dạng escaped
  }).trim();

  // Coi các trường hợp "rỗng về mặt nội dung" (chỉ có thẻ rỗng do Tiptap
  // luôn sinh ra ít nhất 1 <p></p>) là null để nhất quán với hành vi cũ
  // (notes rỗng -> không hiển thị card "Ghi chú" ở FE).
  const strippedText = clean.replace(/<[^>]*>/g, "").trim();
  if (!strippedText) return null;

  return clean;
}

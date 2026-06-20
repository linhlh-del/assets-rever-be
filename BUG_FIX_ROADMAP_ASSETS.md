# 🐛 Bug Fix Roadmap — Assets Module & FE Tổng Thể
**Dự án:** Rever IT Asset Management  
**Ngày phân tích:** 20/06/2026  
**Nguồn:** Bug Tracker (xlsx) + PHAN_TICH_TIEN_DO_FRONTEND_update.md + BE_ANALYSIS_REFACTOR_v2.md + Code review trực tiếp

---

## Trạng thái hiện tại (đã fix trước ngày này)

| ✅ Đã xong | Chi tiết |
|---|---|
| Role system đồng bộ | `constants.js`, `permissions.js`, `Sidebar`, `MobileSidebar`, `router.jsx` → role mới |
| `userService.js` rewrite | Gọi `apiClient` thay Supabase, parse đúng response |
| BE `authorize.js` | `super_admin` bypass |
| BE `users.js` | `jt.name` → `jt.title`, thêm routes còn thiếu |
| `useDepartments` hook | Gọi `GET /api/departments` thật |
| `UserForm` + `UserFilters` | Dùng UUID `department_id`, dropdown động |
| `dashboardService.js` | Đã fix prefix `/api` |

---

## Phần I — Bugs từ Bug Tracker (xlsx)

Tổng cộng **9 bugs** thuộc module Assets được ghi nhận.

---

### BUG-01 · Upload ảnh tài sản thất bại (404)

**Severity:** 🔴 High  
**Chức năng:** Xem chi tiết tài sản → Upload hình ảnh  
**Lỗi:**
```
POST http://localhost:3004/api/assets/mac01/images 404 (Not Found)
assetService.js:77 → AssetImages.jsx:13
```

**Root cause phân tích:**  
Hàm `uploadAssetImages` trong `assetService.js` đang gọi endpoint `/api/assets/{assetCode}/images` nhưng BE Phase 5A (file upload) **chưa được implement**. Theo `BE_ANALYSIS_REFACTOR_v2.md` mục 5, `middleware/upload.js` và upload endpoint là việc còn tồn đọng của Phase 5.

Ngoài ra, hàm truyền `assetCode` thay vì `assetId` (UUID):
```js
// assetService.js dòng 62 — hiện tại SAI
export const uploadAssetImages = async (assetId, files = []) => {
  // ...gọi /api/assets/${assetId}/images — nhưng hook truyền assetCode
```

```js
// useAssets.js dòng 120 — hook
mutationFn: ({ assetCode, files }) => uploadAssetImages(assetCode, files),
// ↑ truyền assetCode, không phải UUID
```

**Fix cần làm:**

**Bước 1 — BE (Phase 5A):** Implement `middleware/upload.js` + endpoint `POST /api/assets/:id/images`
```js
// be/routes/assets.js — thêm vào
import multer from 'multer'
import { supabase } from '../config/supabase.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.post('/:id/images', auth, upload.array('images', 5), async (req, res) => {
  const { id } = req.params
  const uploadedUrls = []
  for (const file of req.files) {
    const fileName = `assets/${id}/${Date.now()}-${file.originalname}`
    const { error } = await supabase.storage.from('asset-images').upload(fileName, file.buffer, {
      contentType: file.mimetype
    })
    if (error) return res.status(500).json({ success: false, message: error.message })
    const { data } = supabase.storage.from('asset-images').getPublicUrl(fileName)
    uploadedUrls.push(data.publicUrl)
  }
  // Lưu URL vào bảng asset_images (nếu có) hoặc trả về URL list
  res.json({ success: true, data: { urls: uploadedUrls } })
})
```

**Bước 2 — FE:** Sửa `AssetImages.jsx` để truyền đúng `assetId` (UUID) thay `assetCode`:
```jsx
// AssetImages.jsx — prop hiện nhận assetCode
// Cần đổi để nhận asset.id khi gọi từ AssetDetailPage
export function AssetImages({ assetId, images = [] }) { // đổi prop name
  const { mutate: uploadImages } = useUploadAssetImages()
  const handleFilesSelected = (files) => {
    uploadImages({ assetId, files }) // truyền id
  }
}
```

**Bước 3 — FE:** Sửa `useAssets.js` nhất quán:
```js
// useAssets.js
mutationFn: ({ assetId, files }) => uploadAssetImages(assetId, files),
```

**File cần sửa:** `be/routes/assets.js`, `be/middleware/upload.js` (tạo mới), `src/components/assets/AssetImages.jsx`, `src/hooks/useAssets.js`, `src/pages/AssetDetailPage.jsx`

---

### BUG-02 · Nút "Chỉnh sửa" trong Asset Detail không hoạt động

**Severity:** 🔴 High  
**Chức năng:** Xem chi tiết tài sản → Click Chỉnh sửa  
**Lỗi:** CTA không mở được modal/view chỉnh sửa

**Root cause phân tích:**  
`AssetDetailPage.jsx` các nút action (Chỉnh sửa, Phân công, Thu hồi, Thanh lý) có JSX đầy đủ nhưng `onClick` handler **không được wire vào state/modal nào**:

```jsx
// AssetDetailPage.jsx — hiện tại (SAI)
<Button variant="primary" className="w-full flex items-center gap-2">
  <Edit2 className="w-4 h-4" />
  Chỉnh sửa
</Button>
// ↑ Không có onClick!
```

Trang `AssetDetailPage` thiếu hoàn toàn phần state quản lý modal + import các modal components.

**Fix cần làm:**

```jsx
// AssetDetailPage.jsx — thêm state + import
import { EditAssetModal } from '@/components/assets/EditAssetModal'
import { AssignAssetModal } from '@/components/assets/AssignAssetModal'
import { ReturnAssetModal } from '@/components/assets/ReturnAssetModal'

export default function AssetDetailPage() {
  const [editingAsset, setEditingAsset] = useState(null)
  const [assigningAsset, setAssigningAsset] = useState(null)
  const [returningAsset, setReturningAsset] = useState(null)

  // ...sau khi fetch asset:

  // Nút Chỉnh sửa:
  <Button onClick={() => setEditingAsset(asset)}>
    <Edit2 /> Chỉnh sửa
  </Button>

  // Cuối JSX — thêm modals:
  <EditAssetModal isOpen={!!editingAsset} onClose={() => setEditingAsset(null)} asset={editingAsset} />
  <AssignAssetModal isOpen={!!assigningAsset} onClose={() => setAssigningAsset(null)} asset={assigningAsset} />
  <ReturnAssetModal isOpen={!!returningAsset} onClose={() => setReturningAsset(null)} asset={returningAsset} />
}
```

**File cần sửa:** `src/pages/AssetDetailPage.jsx`

---

### BUG-03 · Nút "Phân công" trong Asset Detail không hoạt động

**Severity:** 🔴 High  
**Root cause:** Cùng nguyên nhân BUG-02 — nút Phân công thiếu `onClick` handler.  
**Fix:** Xem BUG-02, wire `onClick={() => setAssigningAsset(asset)}` vào nút Phân công.

**File cần sửa:** `src/pages/AssetDetailPage.jsx` (cùng fix với BUG-02)

---

### BUG-04 · Nút "Thanh lý" trong Asset Detail không hoạt động

**Severity:** 🟠 Medium  
**Root cause:** Tương tự BUG-02/03 — nút Thanh lý thiếu `onClick`. Ngoài ra chức năng "Thanh lý" chưa có modal riêng và chưa có BE endpoint xử lý disposal.

**Fix cần làm:**

**Bước 1 — Tạo `DisposalAssetModal.jsx`** (component mới):
```jsx
// src/components/assets/DisposalAssetModal.jsx
// Form gồm: disposal_date, disposal_reason_type (select), disposal_reason (textarea), disposal_price
// Gọi PUT /api/assets/:id với { status: 'disposed', disposal_date, disposal_reason, disposal_price }
```

**Bước 2 — Wire vào `AssetDetailPage.jsx`:**
```jsx
import { DisposalAssetModal } from '@/components/assets/DisposalAssetModal'
// ...
const [disposingAsset, setDisposingAsset] = useState(null)
// Nút Thanh lý:
<Button onClick={() => setDisposingAsset(asset)}>
  <Trash2 /> Thanh lý
</Button>
<DisposalAssetModal isOpen={!!disposingAsset} onClose={() => setDisposingAsset(null)} asset={disposingAsset} />
```

**File cần sửa/tạo:** `src/components/assets/DisposalAssetModal.jsx` (mới), `src/pages/AssetDetailPage.jsx`

---

### BUG-05 · Không có nút Xóa tài sản trong danh sách

**Severity:** 🟠 Medium  
**Chức năng:** Xem danh sách tài sản → tab Hành động  
**Mô tả:** Không có CTA xóa tài sản trong bảng `AssetsList`

**Root cause phân tích:**  
`AssetsList.jsx` chỉ có 4 nút (View, Edit, Assign, Return). Không có nút Delete dù `useDeleteAsset` hook và `deleteAsset` service đã tồn tại.

**Fix cần làm:**

```jsx
// AssetsList.jsx — thêm prop onDelete + nút Xóa
import { Trash2 } from 'lucide-react'

// Thêm prop
export function AssetsList({ ..., onDelete }) {

  // Trong hàng asset — thêm nút xóa (chỉ cho it_admin)
  {!isRegularUser && asset.status === 'available' && (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onDelete(asset)}
      title="Xóa tài sản"
      className="text-red-500 hover:text-red-700"
    >
      <Trash2 className="w-4 h-4" />
    </Button>
  )}
}
```

```jsx
// AssetsPage.jsx — thêm state + confirm dialog + wire
const [deletingAsset, setDeletingAsset] = useState(null)
const { mutate: deleteAsset } = useDeleteAsset()

const handleDelete = (asset) => {
  if (confirm(`Bạn có chắc muốn xóa tài sản ${asset.asset_code}?`)) {
    deleteAsset(asset.id)
  }
}

// Trong AssetsList:
<AssetsList onDelete={handleDelete} ... />
```

**Note:** Chỉ cho phép xóa tài sản có `status === 'available'` để tránh xóa tài sản đang sử dụng. Cân nhắc thêm `DeleteAssetDialog` component riêng (tương tự `DeleteUserDialog`) thay vì dùng `confirm()` native.

**File cần sửa:** `src/components/assets/AssetsList.jsx`, `src/pages/AssetsPage.jsx`

---

### BUG-06 · Format giá tiền: không có preview khi nhập

**Severity:** 🟡 Low  
**Chức năng:** Tạo mới tài sản → Nhập giá tiền mua  
**Mô tả:** Khi nhập `20000000` vào input không có gợi ý hiển thị dạng `20.000.000 VNĐ`

**Fix cần làm:**

```jsx
// AssetForm.jsx — thêm state preview và helper
import { formatCurrency } from '@/utils/formatters'

const [pricePreview, setPricePreview] = useState('')

const handlePriceChange = (e) => {
  const raw = e.target.value
  setPricePreview(raw ? new Intl.NumberFormat('vi-VN').format(Number(raw)) + ' ₫' : '')
}

// Trong JSX:
<Input
  {...register('purchase_price')}
  type="number"
  placeholder="25000000"
  onChange={handlePriceChange}
/>
{pricePreview && (
  <p className="text-xs text-muted-foreground mt-1">≈ {pricePreview}</p>
)}
```

**File cần sửa:** `src/components/assets/AssetForm.jsx`

---

### BUG-07 · Format giá tiền sai: hiển thị `20000000.00` thay vì định dạng VNĐ

**Severity:** 🟠 Medium  
**Chức năng:** Danh sách tài sản + Chi tiết tài sản — cột Giá (VNĐ)  
**Mô tả:** Giá hiển thị dạng `20000000.00` thay vì `20.000.000`

**Root cause phân tích:**  
`AssetsList.jsx` và `AssetDetailPage.jsx` đang dùng `.toLocaleString('vi-VN')` nhưng field từ Postgres là `numeric(15,2)` → trả về dạng string `"20000000.00"` → `.toLocaleString()` parse thành float và hiển thị sai.

```jsx
// AssetsList.jsx dòng ~90 — hiện tại
{asset.purchase_price?.toLocaleString('vi-VN')}
// Nếu purchase_price = "20000000.00" (string), .toLocaleString() sẽ fail
```

**Fix cần làm:**

```jsx
// Dùng formatCurrency từ utils/formatters.js đã có sẵn
import { formatCurrency } from '@/utils/formatters'

// Trong AssetsList.jsx và AssetDetailPage.jsx:
{asset.purchase_price
  ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' })
      .format(parseFloat(asset.purchase_price))
  : '—'}

// Hoặc đơn giản hơn — thêm helper vào formatters.js:
export const formatVND = (value) => {
  if (!value) return '—'
  return new Intl.NumberFormat('vi-VN').format(parseFloat(value)) + ' ₫'
}
```

**File cần sửa:** `src/components/assets/AssetsList.jsx`, `src/pages/AssetDetailPage.jsx`, `src/utils/formatters.js`

---

### BUG-08 · Tạo mới tài sản: không có trường upload hình ảnh

**Severity:** 🟡 Low  
**Chức năng:** Tạo mới tài sản bằng popup  
**Mô tả:** `AddAssetModal` → `AssetForm` không có field upload ảnh

**Root cause phân tích:**  
`AssetForm.jsx` chỉ có text fields. Upload ảnh chỉ khả dụng trong `AssetDetailPage` sau khi tài sản đã được tạo (component `AssetImages`). Đây là quyết định thiết kế — upload khi tạo mới sẽ phức tạp vì cần `assetId` để lưu ảnh vào đúng thư mục.

**Đề xuất giải pháp (2 lựa chọn):**

**Option A (đơn giản hơn):** Sau khi tạo tài sản thành công, redirect tới trang detail và thông báo "Tạo thành công! Bạn có thể upload ảnh tại đây."
```jsx
// AddAssetModal.jsx
createAsset(data, {
  onSuccess: (newAsset) => {
    onClose()
    navigate(`/assets/${newAsset.id}`)
    toast.success('Tạo tài sản thành công! Upload ảnh tại đây.')
  }
})
```

**Option B (đầy đủ hơn):** Thêm bước upload ảnh 2-step trong modal sau khi tạo xong.

**Khuyến nghị:** Dùng Option A vì đơn giản và tránh UX phức tạp. BUG-01 (BE chưa có upload endpoint) cần được fix trước.

**File cần sửa:** `src/components/assets/AddAssetModal.jsx`

---

### BUG-09 · Tạo mới tài sản: không có trường chọn hóa đơn

**Severity:** 🔴 High (core business logic)  
**Chức năng:** Tạo mới tài sản bằng popup  
**Mô tả:** Không có trường chọn hóa đơn. Theo schema VPS, `assets.invoice_id` là UUID FK → `invoices(id)` — đây là liên kết cốt lõi giữa IT và kế toán.

**Root cause phân tích:**  
`AssetForm.jsx` không có field `invoice_id`. Schema VPS:
```sql
assets.invoice_id  uuid  → FK → invoices(id)
```

**Fix cần làm:**

**Bước 1 — Thêm hook `useInvoices` cho dropdown:**
```js
// src/hooks/useInvoices.js — thêm hook mới (hiện useInvoices đang gọi Supabase trực tiếp)
// Sau khi fix invoiceService → apiClient, dùng:
export const useInvoiceOptions = () => {
  return useQuery({
    queryKey: ['invoices', 'options'],
    queryFn: () => apiClient.get('/api/invoices?limit=100').then(r => r?.data?.invoices || []),
    staleTime: 5 * 60 * 1000,
  })
}
```

**Bước 2 — Thêm field vào `AssetForm.jsx`:**
```jsx
// AssetForm.jsx
import { useInvoiceOptions } from '@/hooks/useInvoices'

// Trong component:
const { data: invoices = [] } = useInvoiceOptions()

// Thêm vào Zod schema:
invoice_id: z.string().uuid().optional().nullable()

// Thêm vào form JSX:
<div>
  <label className="block text-sm font-medium mb-1">Hóa đơn</label>
  <Select {...register('invoice_id')}>
    <option value="">-- Chọn hóa đơn (không bắt buộc) --</option>
    {invoices.map(inv => (
      <option key={inv.id} value={inv.id}>
        {inv.invoice_number} — {inv.vendor_name}
      </option>
    ))}
  </Select>
</div>
```

**Note:** `invoiceService.js` cần được rewrite sang `apiClient` trước (xem Phần II - Bug-G).

**File cần sửa:** `src/components/assets/AssetForm.jsx`, `src/hooks/useInvoices.js`

---

## Phần II — Bugs kiến trúc liên quan Assets (từ code review)

Các bug này không có trong bug tracker nhưng ảnh hưởng trực tiếp đến module Assets hoạt động.

---

### BUG-A · `assetService.js` — URL prefix bị nhân đôi

**Severity:** 🔴 Blocker  
**Root cause:**
```js
// src/services/api.js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004'
// ↑ Đúng — không có /api ở cuối

// src/services/assetService.js — ĐÚNG (đã có /api prefix trong endpoint)
apiClient.get(`/api/assets?${params}`)
```

Theo PHAN_TICH_TIEN_DO, `AuthContext.jsx` đang dùng:
```js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api'
// ↑ SAI — có /api ở cuối, gây double prefix khi gọi /api/auth/me
```

**Fix:** Đồng bộ `API_BASE_URL` thành `http://localhost:3004` (không có `/api`), endpoint thêm prefix `/api/` khi gọi.

**File cần sửa:** `src/contexts/AuthContext.jsx` (line `API_BASE_URL`)

---

### BUG-B · `AssetDetailPage.jsx` — `assetId` từ URL params nhưng dùng nhầm `asset_code`

**Severity:** 🟠 Medium  

`AssetHistoryPage.jsx` navigate bằng `asset.asset_code`:
```jsx
// AssetHistoryPage.jsx
navigate(`/assets/${asset.asset_code}`) // SAI — nên dùng asset.id
```

Trong khi `AssetsPage.jsx` đúng:
```jsx
navigate(`/assets/${asset.id}`) // ĐÚNG
```

`AssetDetailPage.jsx` lấy `assetId` từ `useParams()` và gọi `getAsset(assetId)` — nếu truyền `asset_code` thay vì UUID, BE sẽ không tìm thấy record.

**Fix:**
```jsx
// AssetHistoryPage.jsx
navigate(`/assets/${asset.id}`) // đổi từ asset_code → id
```

**File cần sửa:** `src/pages/AssetHistoryPage.jsx`

---

### BUG-C · `uploadAssetImages` dùng dynamic import không đúng cách

**Severity:** 🔴 Blocker  
**File:** `src/services/assetService.js` dòng 62-76

```js
// assetService.js — HIỆN TẠI (SAI)
const {
  data: { session },
} = await import('@/services/api').then((m) => m.supabase.auth.getSession())
// ↑ import() trả về module, không phải result của getSession()
// Đúng phải là:
```

**Fix:**
```js
// assetService.js — FIX
import { supabase } from '@/services/api' // static import ở đầu file (đã tồn tại)

export const uploadAssetImages = async (assetId, files = []) => {
  const { data: { session } } = await supabase.auth.getSession()
  const formData = new FormData()
  files.forEach(file => formData.append('images', file))

  const response = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:3004'}/api/assets/${assetId}/images`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: formData,
    }
  )
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
  return response.json()
}
```

**File cần sửa:** `src/services/assetService.js`

---

### BUG-D · `pdfGenerators.js` dùng `require()` trong ESM (runtime crash)

**Severity:** 🔴 Blocker khi dùng tính năng PDF  
**File:** `src/utils/pdfGenerators.js`

```js
// HIỆN TẠI (SAI — require không tồn tại trong ESM/Vite)
export const generateDisposalReport = (assets) => {
  const { jsPDF } = require('jspdf')
  require('jspdf-autotable')
  // ...
}
```

**Fix:**
```js
// ĐỔI THÀNH async + dynamic import
export const generateDisposalReport = async (assets) => {
  const { jsPDF } = await import('jspdf')
  await import('jspdf-autotable')
  // ...
}

export const generateMaintenanceCertificate = async (ticket) => {
  const { jsPDF } = await import('jspdf')
  // ...
}
```

**File cần sửa:** `src/utils/pdfGenerators.js`

---

### BUG-E · `ReturnAssetModal.jsx` dùng `DEPARTMENTS` constant rỗng

**Severity:** 🟡 Low  
**File:** `src/components/assets/ReturnAssetModal.jsx`

```jsx
import { DEPARTMENTS } from '@/utils/constants'
// DEPARTMENTS = [] (rỗng!) — dropdown "Bộ phận lưu giữ" luôn trống
```

**Fix:** Dùng `useDepartments()` hook thật:
```jsx
import { useDepartments } from '@/hooks/useDepartments'

const { departments = [] } = useDepartments()
// Thay vì: {DEPARTMENTS.map(...)} dùng {departments.map(...)}
```

**File cần sửa:** `src/components/assets/ReturnAssetModal.jsx`

---

### BUG-F · `invoiceService.js` gọi Supabase trực tiếp (ảnh hưởng BUG-09)

**Severity:** 🔴 Blocker  
**File:** `src/services/invoiceService.js`

Toàn bộ file gọi `supabase.from('invoices')` — bảng không tồn tại trên Supabase. Ảnh hưởng trực tiếp đến BUG-09 (chọn hóa đơn khi tạo tài sản).

**Fix — rewrite sang apiClient:**
```js
// src/services/invoiceService.js — REWRITE HOÀN TOÀN
import { apiClient } from '@/services/api'
import { supabase } from '@/services/api' // chỉ giữ để upload file lên Storage

export const getInvoices = async ({ search = '', page = 1, limit = 20 } = {}) => {
  const params = new URLSearchParams({ page, limit })
  if (search) params.set('search', search)
  const res = await apiClient.get(`/api/invoices?${params}`)
  return { data: res?.data?.invoices || [], total: res?.data?.pagination?.total || 0 }
}

export const getInvoice = async (invoiceNumber) => {
  const res = await apiClient.get(`/api/invoices/${invoiceNumber}`)
  return res?.data?.invoice || null
}

export const createInvoice = async (data) => {
  const res = await apiClient.post('/api/invoices', data)
  return res?.data?.invoice
}

export const updateInvoice = async (invoiceNumber, data) => {
  const res = await apiClient.put(`/api/invoices/${invoiceNumber}`, data)
  return res?.data?.invoice
}

export const uploadInvoiceFile = async (file, invoiceNumber) => {
  // File upload vẫn dùng Supabase Storage
  const fileName = `invoices/${invoiceNumber}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('invoices').upload(fileName, file)
  if (error) throw error
  const { data } = supabase.storage.from('invoices').getPublicUrl(fileName)
  return data.publicUrl
}

// confirmInvoice — chờ clarify với BE về cột status
// export const confirmInvoice = ...
```

**Note:** BE không có cột `status` trong `invoices` — cần clarify. Tạm comment `confirmInvoice` ra.

**File cần sửa:** `src/services/invoiceService.js`

---

### BUG-G · Security: Token bị log ra console production

**Severity:** 🔴 Critical Security  
**File:** `src/services/api.js`

```js
// api.js — HIỆN TẠI (lỗ hổng bảo mật)
// Dòng đã được comment nhưng cần xác nhận xoá hẳn, không để commented code nhạy cảm
```

**Fix:**
```js
// Xóa hoàn toàn các console.log liên quan token
// Chỉ giữ lại nếu cần thì bọc trong:
if (import.meta.env.DEV) {
  console.log(`📡 ${options.method || 'GET'} ${endpoint}`)
}
```

**File cần sửa:** `src/services/api.js`

---

## Phần III — Lộ trình Fix (Priority Order)

### 🔴 Sprint 1 — Blockers (fix ngay, 1-2 ngày)

| # | Bug | File(s) | Effort |
|---|---|---|---|
| BUG-C | `uploadAssetImages` dynamic import sai cú pháp | `assetService.js` | 30 phút |
| BUG-G | Security: dọn console.log token | `api.js`, `AuthContext.jsx` | 30 phút |
| BUG-A | Double `/api` prefix trong `AuthContext.jsx` | `AuthContext.jsx` | 15 phút |
| BUG-D | `require()` trong ESM crash PDF generator | `pdfGenerators.js` | 1 giờ |
| BUG-F | `invoiceService.js` rewrite → apiClient | `invoiceService.js` | 3 giờ |

### 🟠 Sprint 2 — High Impact UX (2-3 ngày)

| # | Bug | File(s) | Effort |
|---|---|---|---|
| BUG-02/03 | Wire nút Chỉnh sửa + Phân công trong Asset Detail | `AssetDetailPage.jsx` | 2 giờ |
| BUG-07 | Format giá tiền VNĐ đúng chuẩn | `AssetsList.jsx`, `AssetDetailPage.jsx`, `formatters.js` | 1 giờ |
| BUG-09 | Thêm field chọn hóa đơn khi tạo tài sản | `AssetForm.jsx`, `useInvoices.js` | 3 giờ |
| BUG-05 | Thêm nút Xóa tài sản trong danh sách | `AssetsList.jsx`, `AssetsPage.jsx` | 2 giờ |
| BUG-B | Nhất quán dùng UUID trong navigate | `AssetHistoryPage.jsx` | 15 phút |
| BUG-E | `ReturnAssetModal` dropdown phòng ban rỗng | `ReturnAssetModal.jsx` | 1 giờ |

### 🟡 Sprint 3 — Medium (3-5 ngày)

| # | Bug | File(s) | Effort |
|---|---|---|---|
| BUG-04 | Tạo `DisposalAssetModal` + wire nút Thanh lý | `DisposalAssetModal.jsx` (mới), `AssetDetailPage.jsx` | 4 giờ |
| BUG-06 | Preview format tiền khi nhập | `AssetForm.jsx` | 1 giờ |
| BUG-08 | Redirect sau tạo tài sản → trang detail để upload ảnh | `AddAssetModal.jsx` | 1 giờ |
| BUG-01 | Upload ảnh BE + FE (phụ thuộc Phase 5A BE) | `assetService.js`, `AssetImages.jsx`, BE | 1 ngày |

### ⏸ Sprint 4 — Phụ thuộc (sau khi BE Phase 5 xong)

| # | Bug | Phụ thuộc |
|---|---|---|
| BUG-01 | Upload ảnh tài sản hoàn chỉnh | BE Phase 5A: `middleware/upload.js` + endpoint |
| BUG-09 full | Dropdown hóa đơn đầy đủ | `invoiceService` rewrite (BUG-F) |

---

## Phần IV — Checklist trước khi deploy production

```
Security
[ ] Xóa/guard tất cả console.log access token (BUG-G)
[ ] Gỡ TestSupabase.jsx khỏi DashboardPage (chưa có trong bug tracker nhưng quan trọng)
[ ] Resolve git conflict README.md và .gitignore

Assets Module
[ ] Format tiền VNĐ đúng ở tất cả chỗ hiển thị (BUG-07)
[ ] Nút Chỉnh sửa / Phân công / Thu hồi hoạt động trong Asset Detail (BUG-02/03)
[ ] Field chọn hóa đơn trong form tạo tài sản (BUG-09)
[ ] Nút Xóa tài sản trong danh sách (BUG-05)

Service Layer
[ ] invoiceService.js rewrite sang apiClient (BUG-F)
[ ] assetService.js upload function fix (BUG-C)
[ ] pdfGenerators.js đổi require → dynamic import (BUG-D)

Còn lại (không block launch)
[ ] Upload ảnh khi tạo tài sản (BUG-08) — dùng Option A: redirect sau tạo
[ ] Thanh lý tài sản full flow (BUG-04) — có thể defer
[ ] Preview format tiền khi nhập (BUG-06) — nice-to-have
```

---

## Phần V — File nào cần sửa (tổng hợp)

| File | Bugs | Ghi chú |
|---|---|---|
| `src/pages/AssetDetailPage.jsx` | BUG-02, 03, 04 | Wire modals + state |
| `src/components/assets/AssetsList.jsx` | BUG-05, 07 | Nút xóa + format tiền |
| `src/components/assets/AssetForm.jsx` | BUG-06, 09 | Preview tiền + field invoice |
| `src/components/assets/AssetImages.jsx` | BUG-01, 08 | Đổi prop assetCode → assetId |
| `src/components/assets/ReturnAssetModal.jsx` | BUG-E | useDepartments thay DEPARTMENTS[] |
| `src/components/assets/AddAssetModal.jsx` | BUG-08 | Redirect sau tạo thành công |
| `src/components/assets/DisposalAssetModal.jsx` | BUG-04 | Tạo mới |
| `src/services/assetService.js` | BUG-C, 01 | Fix dynamic import + uploadImages |
| `src/services/invoiceService.js` | BUG-F, 09 | Rewrite hoàn toàn sang apiClient |
| `src/services/api.js` | BUG-G | Dọn console.log token |
| `src/contexts/AuthContext.jsx` | BUG-A | Fix API_BASE_URL |
| `src/pages/AssetHistoryPage.jsx` | BUG-B | asset.id thay asset.asset_code |
| `src/utils/formatters.js` | BUG-07 | Thêm formatVND helper |
| `src/utils/pdfGenerators.js` | BUG-D | require → dynamic import |
| `src/hooks/useAssets.js` | BUG-01 | Nhất quán assetId |
| `src/hooks/useInvoices.js` | BUG-09 | Thêm useInvoiceOptions hook |

---

*Phân tích bởi Claude — 20/06/2026. Dựa trên: bug-tracker.xlsx (9 bugs), PHAN_TICH_TIEN_DO_FRONTEND_update.md, BE_ANALYSIS_REFACTOR_v2.md, code review trực tiếp toàn bộ src/.*

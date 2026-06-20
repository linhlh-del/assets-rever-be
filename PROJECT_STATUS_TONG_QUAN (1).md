# 📊 Báo Cáo Tổng Quan Dự Án — Rever IT Asset Management
**Ngày:** 20/06/2026  
**Phạm vi:** Backend (Express + VPS Postgres) + Frontend (React + Vite)  
**Nguồn phân tích:** Code review trực tiếp toàn bộ `be/` và `fe/src/` + bug-tracker.xlsx + tài liệu phân tích 19/06

---

## 0. Tóm tắt điều hành

| Layer | Tình trạng | Ghi chú |
|---|---|---|
| BE — Phase 1→4 | ✅ Hoàn thành | Schema đúng VPS, auth JWKS, pg Pool |
| BE — Phase 5 | 🟡 Một phần | upload, auditLog, rate-limit chưa làm |
| BE — Routes cũ còn sót | 🔴 Cần dọn | `allocation_slips.js`, `return_slips.js` vẫn dùng Supabase + bảng không tồn tại |
| BE — Invoices route | 🔴 Role sai | dùng `admin_it/accountant` thay vì `it_admin/manager` |
| BE — Maintenance route | 🟠 Role sai | dùng `admin_it/accountant` |
| FE — Role system | ✅ Đã fix 19/06 | `constants.js`, `permissions.js`, sidebar, router |
| FE — userService | ✅ Đã fix 19/06 | Gọi đúng apiClient |
| FE — Assets module | 🟡 Gần đúng | Còn bugs UX từ bug-tracker |
| FE — Invoice/Maintenance/Slips services | 🔴 Hỏng | Vẫn gọi Supabase trực tiếp |
| FE — Reports | 🔴 Mockup | Hard-code, chưa nối API |

**Vấn đề gốc rễ còn lại (sau session fix 19/06):** BE có 2 route file cũ (`allocation_slips.js`, `return_slips.js`) không được mount vào `server.js` nhưng vẫn tồn tại gây nhầm lẫn. Quan trọng hơn, `routes/invoices.js` và `routes/maintenance.js` đang dùng role name sai (`admin_it`, `accountant`) — tất cả request từ `it_admin` và `manager` sẽ bị 403.

---

## 1. Trạng thái Backend chi tiết

### 1.1. ✅ Đã đúng & hoạt động

| File | Trạng thái | Ghi chú |
|---|---|---|
| `server.js` | ✅ | Mount đủ 9 routes, helmet, CORS restrict |
| `config/db.js` | ✅ | pg Pool → VPS Postgres port 5433 |
| `config/supabase.js` | ✅ | SERVICE_ROLE_KEY, dùng cho Storage |
| `middleware/auth.js` | ✅ | JWKS lazy-init, VPS lookup, auth_user_id sync |
| `middleware/authorize.js` | ✅ | super_admin bypass, role check đúng |
| `middleware/validate.js` | ✅ | Joi middleware, ESM |
| `validation/schemas.js` | ✅ | Đủ schema: user, userUpdate, asset, invoice, maintenance, handover, return |
| `routes/auth.js` | ✅ | GET /auth/me only |
| `routes/assets.js` | ✅ | pg query, đúng columns VPS, UUID, transaction |
| `routes/dashboard.js` | ✅ | Promise.all, không dùng cột cũ |
| `routes/users.js` | ✅ | CRUD + bulk + reactivate + asset-history, role mới |
| `routes/departments.js` | ✅ | GET flat list + parent_name |
| `routes/handover.js` | ✅ | Transaction, handover_slip_items, asset_history |

### 1.2. 🔴 Bugs nghiêm trọng trong BE

---

#### BE-BUG-01 · `routes/invoices.js` — Role names sai (🔴 Blocker)

**File:** `be/routes/invoices.js`

```js
// HIỆN TẠI (SAI — role cũ)
router.post("/",   authenticate, authorize("admin_it", "accountant"), ...)
router.put("/...", authenticate, authorize("admin_it", "accountant"), ...)
router.delete(".", authenticate, authorize("admin_it"), ...)
```

VPS schema thực tế không có role `admin_it` hay `accountant`. Kết quả: **mọi POST/PUT/DELETE vào `/api/invoices` đều bị 403**, kể cả `it_admin`. Chỉ `super_admin` bypass được (vì có early-return trong `authorize.js`).

**Fix:**
```js
// SỬA THÀNH
router.post("/",   authenticate, authorize("it_admin", "manager"), ...)
router.put("/...", authenticate, authorize("it_admin", "manager"), ...)
router.delete(".", authenticate, authorize("it_admin"), ...)
```

**File cần sửa:** `be/routes/invoices.js` (3 dòng authorize)

---

#### BE-BUG-02 · `routes/maintenance.js` — Role names sai (🔴 Blocker)

**File:** `be/routes/maintenance.js`

```js
// HIỆN TẠI (SAI)
router.put("/:ticketId",        authenticate, authorize("admin_it", "accountant"), ...)
router.patch("/:ticketId/status", authenticate, authorize("admin_it", "accountant"), ...)
router.delete("/:ticketId",       authenticate, authorize("admin_it"), ...)
```

**Fix:**
```js
// SỬA THÀNH
router.put("/:ticketId",          authenticate, authorize("it_admin", "manager"), ...)
router.patch("/:ticketId/status", authenticate, authorize("it_admin", "manager"), ...)
router.delete("/:ticketId",       authenticate, authorize("it_admin"), ...)
```

**File cần sửa:** `be/routes/maintenance.js` (3 dòng authorize)

---

#### BE-BUG-03 · `routes/reports.js` — Role names sai (🔴 Blocker)

**File:** `be/routes/reports.js`

```js
// HIỆN TẠI (SAI)
router.post("/assets",      authenticate, authorize("admin_it", "accountant"), ...)
router.post("/maintenance", authenticate, authorize("admin_it", "accountant"), ...)
router.post("/users",       authenticate, authorize("admin_it"), ...)
```

**Fix:**
```js
router.post("/assets",      authenticate, authorize("it_admin", "manager"), ...)
router.post("/maintenance", authenticate, authorize("it_admin", "manager"), ...)
router.post("/users",       authenticate, authorize("it_admin"), ...)
```

**File cần sửa:** `be/routes/reports.js` (3 dòng authorize)

---

#### BE-BUG-04 · `routes/maintenance.js` — `generate_ticket_number()` function có thể không tồn tại (🟠 High)

**File:** `be/routes/maintenance.js`

```js
// POST /maintenance — tạo ticket
const { rows: numRows } = await pool.query(
  `SELECT generate_ticket_number() AS ticket_number`,
);
```

Nếu function `generate_ticket_number()` chưa được tạo trong VPS Postgres, mọi POST vào `/api/maintenance` sẽ crash với `function generate_ticket_number() does not exist`.

**Fix tạm thời (nếu function chưa tồn tại):**
```js
// Tạo ticket_number theo pattern đơn giản
const ticketNumber = `TK-${Date.now()}`
// Hoặc query max + 1:
const { rows } = await pool.query(
  `SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 4) AS INT)), 0) + 1 AS next_num
   FROM maintenance_tickets WHERE ticket_number ~ '^TK-[0-9]+'`
)
const ticketNumber = `TK-${String(rows[0].next_num).padStart(5, '0')}`
```

**Fix dứt điểm:** Tạo function trên VPS:
```sql
CREATE OR REPLACE FUNCTION generate_ticket_number() RETURNS VARCHAR AS $$
  SELECT 'TK-' || LPAD(nextval('ticket_number_seq')::TEXT, 5, '0');
$$ LANGUAGE SQL;
CREATE SEQUENCE IF NOT EXISTS ticket_number_seq START 1;
```

**File cần sửa:** `be/routes/maintenance.js` (hoặc tạo function trên VPS)

---

#### BE-BUG-05 · `routes/reports.js` — Query dùng view `v_assets_full` có thể không tồn tại (🟠 High)

```js
// reports.js
const { rows: assets } = await pool.query(
  `SELECT * FROM v_assets_full ${where}`, params
)
```

View `v_assets_full` chưa được xác nhận tồn tại trên VPS. Nếu không có, mọi POST `/api/reports/assets` crash.

**Fix:**
```js
// Thay v_assets_full bằng query trực tiếp
const { rows: assets } = await pool.query(
  `SELECT a.*,
          u.full_name AS current_user_name,
          d.name AS current_department_name
   FROM assets a
   LEFT JOIN users u ON u.employee_code = a.current_user_employee_code
   LEFT JOIN departments d ON d.id = u.department_id
   ${where}`, params
)
```

**File cần sửa:** `be/routes/reports.js`

---

#### BE-BUG-06 · `routes/assets.js` — `POST /assign` tạo handover_slip nhưng `asset_id` trực tiếp, không dùng `handover_slip_items` (🟡 Medium)

**File:** `be/routes/assets.js` — route `POST /:id/assign`

```js
// assets.js — dòng ~160 (SAI — handover_slips không có cột asset_id trực tiếp)
await client.query(
  `INSERT INTO handover_slips
     (id, asset_id, to_employee_code, slip_type, issued_by, status)
   VALUES ($1, $2, $3, 'handover', $4, 'draft')`,
  [randomUUID(), assetId, employee_code, req.user.employee_code],
)
```

Theo schema VPS thực tế: `handover_slips` không có cột `asset_id` trực tiếp — cấu trúc là `handover_slips` → `handover_slip_items(slip_id, asset_id)`. Route `/handover` đã làm đúng, nhưng `/assets/:id/assign` vẫn dùng pattern cũ → sẽ crash với `column "asset_id" of relation "handover_slips" does not exist`.

**Fix:**
```js
// assets.js — POST /:id/assign — sau khi INSERT handover_slips:
const { rows: slipRows } = await client.query(
  `INSERT INTO handover_slips
     (id, to_employee_code, slip_type, issued_by, status)
   VALUES ($1, $2, 'handover', $3, 'draft')
   RETURNING id`,
  [randomUUID(), employee_code, req.user.employee_code]
)
// Thêm vào handover_slip_items
await client.query(
  `INSERT INTO handover_slip_items (slip_id, asset_id) VALUES ($1, $2)`,
  [slipRows[0].id, assetId]
)
```

Tương tự với `POST /:id/return`:
```js
// Tạo return slip KHÔNG có asset_id
const { rows: slipRows } = await client.query(
  `INSERT INTO handover_slips
     (id, from_employee_code, slip_type, issued_by, status, notes)
   VALUES ($1, $2, 'return', $3, 'draft', $4)
   RETURNING id`,
  [randomUUID(), prevEmployee, req.user.employee_code, notes || null]
)
// Insert vào handover_slip_items
await client.query(
  `INSERT INTO handover_slip_items (slip_id, asset_id) VALUES ($1, $2)`,
  [slipRows[0].id, assetId]
)
```

**File cần sửa:** `be/routes/assets.js` (2 routes: assign + return)

---

#### BE-BUG-07 · `routes/invoices.js` — Response format không nhất quán, thiếu pagination (🟡 Medium)

```js
// invoices.js — GET /
const { rows: invoices } = await pool.query(`SELECT i.*...`)
res.json({ success: true, data: { invoices } })
// ↑ Không có pagination, không có filter search/date
```

FE `invoiceService.js` sau khi rewrite sẽ gọi với params `search`, `page`, `limit` — nhưng BE chưa xử lý. Kết quả: mỗi request trả về toàn bộ invoices không giới hạn.

**Fix:**
```js
router.get("/", authenticate, async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query
  const conditions = [], params = []

  if (search) {
    params.push(`%${search}%`)
    conditions.push(`(i.invoice_number ILIKE $${params.length} OR i.vendor_name ILIKE $${params.length})`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM invoices i ${where}`, params
  )
  const pageNum = parseInt(page), pageSize = parseInt(limit)
  params.push(pageSize, (pageNum - 1) * pageSize)
  const { rows: invoices } = await pool.query(
    `SELECT i.*, u.full_name AS created_by_name
     FROM invoices i
     LEFT JOIN users u ON u.employee_code = i.created_by
     ${where} ORDER BY i.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`, params
  )
  res.json({
    success: true,
    data: {
      invoices,
      pagination: { total: parseInt(count), page: pageNum, limit: pageSize }
    }
  })
})
```

**File cần sửa:** `be/routes/invoices.js`

---

#### BE-BUG-08 · Các file route cũ không được dùng — cần xóa (🟡 Tech Debt)

2 file route cũ không được mount trong `server.js` nhưng vẫn tồn tại:
- `be/routes/allocation_slips.js` — dùng `supabase.from("allocation_slips")` (bảng không tồn tại), import `authenticate` sai từ `../middleware/auth.js` thay vì `authenticate` từ named export
- `be/routes/return_slips.js` — dùng `supabase.from("return_slips")` (bảng không tồn tại)

Không ảnh hưởng runtime vì không mount, nhưng gây nhầm lẫn dev mới và có thể được import nhầm.

**Fix:** Xóa cả 2 file hoặc chuyển vào `archive/` để tham khảo.

---

#### BE-BUG-09 · `routes/maintenance.js` — `GET /` chỉ trả `tickets`, không có `pagination` hay `records` (🟡 Medium)

```js
// maintenance.js
res.json({ success: true, data: { tickets } })
// FE MaintenancePage.jsx đang đọc:
data?.records || []  // ← SAI, phải là data?.data?.tickets
```

Kết quả: MaintenancePage luôn hiển thị danh sách rỗng dù có dữ liệu.

**Fix BE** (thêm pagination):
```js
res.json({
  success: true,
  data: {
    tickets,
    pagination: { total: tickets.length, page: 1, limit: 50 }
  }
})
```

**Fix FE** (`MaintenancePage.jsx`): `data?.data?.tickets || []` thay vì `data?.records || []`

---

#### BE-BUG-10 · Phase 5 chưa implement — upload ảnh tài sản (🟡 Medium — chặn BUG-01 FE)

Theo `BE_ANALYSIS_REFACTOR_v2.md`, Phase 5A (`middleware/upload.js`) chưa làm. Endpoint `POST /api/assets/:id/images` không tồn tại → FE upload ảnh luôn 404.

**Cần làm:**
```js
// be/middleware/upload.js — TẠO MỚI
import multer from 'multer'
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    cb(null, allowed.includes(file.mimetype))
  }
})

// be/routes/assets.js — THÊM route
import { upload } from '../middleware/upload.js'
import supabase from '../config/supabase.js'

router.post('/:id/images', authenticate, authorize('it_admin', 'manager'),
  upload.array('images', 5), async (req, res, next) => {
    try {
      const { id } = req.params
      const urls = []
      for (const file of req.files) {
        const path = `assets/${id}/${Date.now()}-${file.originalname}`
        const { error } = await supabase.storage
          .from('asset-images').upload(path, file.buffer, { contentType: file.mimetype })
        if (error) throw error
        const { data } = supabase.storage.from('asset-images').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      res.json({ success: true, data: { urls } })
    } catch (error) { next(error) }
  }
)
```

---

### 1.3. ✅ Không phải bug nhưng cần lưu ý

| Item | Ghi chú |
|---|---|
| `scripts/importCsv.js` dùng cột cũ (`color`, `department`, `warranty_period`) | Không ảnh hưởng runtime — chỉ dùng khi migrate data |
| `scripts/seedAssets.js` dùng cột cũ tương tự | Tương tự |
| `routes/auth.js` trả `{ user: req.user }` không có wrapper `{ success, data }` | AuthContext FE đang đọc `data.user` — cần align |
| BE Phase 5B/C/D/E chưa làm (auditLog, AppError, rate-limiting) | Không block MVP |

---

## 2. Trạng thái Frontend chi tiết

### 2.1. ✅ Module hoạt động tốt

| Module | File chính | Trạng thái |
|---|---|---|
| Auth (Google OAuth + BE sync) | `AuthContext.jsx`, `api.js` | ✅ Cache 5 phút, retry-once, refresh token |
| Design system / UI Components | `components/common/*` | ✅ Đầy đủ, responsive, Tailwind |
| Layout (Sidebar, Header, MobileSidebar) | `layout/*` | ✅ Role mới, filter menu theo role |
| Router + ProtectedRoute | `router.jsx` | ✅ Role mới, lazy-load |
| Assets — danh sách + CRUD cơ bản | `AssetsPage.jsx`, `assetService.js`, `useAssets.js` | ✅ Gọi đúng apiClient |
| Users — danh sách + CRUD | `UsersPage.jsx`, `userService.js`, `useUsers.js` | ✅ Rewrite xong 19/06 |
| Departments — dropdown | `useDepartments.js`, `UserForm.jsx`, `UserFilters.jsx` | ✅ Gọi `/api/departments` |
| Dashboard — stats + charts | `DashboardPage.jsx`, `dashboardService.js` | 🟡 Logic đúng, 1 bug nhỏ (xem bên dưới) |
| Export Excel | `exportUtils.js` | ✅ SheetJS, nối UsersPage/AssetHistoryPage |

### 2.2. 🔴 Bugs nghiêm trọng

---

#### FE-BUG-01 · `invoiceService.js` — Toàn bộ gọi Supabase trực tiếp (🔴 Blocker)

**File:** `src/services/invoiceService.js`

```js
// HIỆN TẠI (SAI — toàn bộ file)
import { supabase } from '@/services/api'
export const getInvoices = async (...) => {
  const { data, error } = await supabase.from('invoices').select(...)
  // ↑ bảng invoices KHÔNG TỒN TẠI trên Supabase
}
```

Kết quả: `InvoicesPage` luôn crash, không load được dữ liệu.

**Fix — Rewrite hoàn toàn:**
```js
import { apiClient, supabase } from '@/services/api'

export const getInvoices = async ({ search = '', page = 1, limit = 20 } = {}) => {
  const params = new URLSearchParams({ page, limit })
  if (search) params.set('search', search)
  const res = await apiClient.get(`/api/invoices?${params}`)
  return {
    data: res?.data?.invoices || [],
    total: res?.data?.pagination?.total || 0,
  }
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

// File upload vẫn dùng Supabase Storage
export const uploadInvoiceFile = async (file, invoiceNumber) => {
  const fileName = `invoices/${invoiceNumber}/${Date.now()}-${file.name}`
  const { error } = await supabase.storage.from('invoices').upload(fileName, file)
  if (error) throw error
  const { data } = supabase.storage.from('invoices').getPublicUrl(fileName)
  return data.publicUrl
}
```

**Ghi chú:** `confirmInvoice` tạm comment vì DB không có cột `status` trong `invoices` — cần clarify với BE.

---

#### FE-BUG-02 · `maintenanceService.js` — Toàn bộ gọi Supabase trực tiếp + sai schema (🔴 Blocker)

**File:** `src/services/maintenanceService.js`

```js
// HIỆN TẠI (SAI)
import { supabase } from '@/services/api'
export const getMaintenanceTickets = async (...) => {
  const { data } = await supabase.from('maintenance_tickets').select(...)
  // ↑ bảng không tồn tại trên Supabase
}
// Schema sai: status = 'open'/'closed' thay vì 'pending'/'in_progress'/'completed'/'cannot_fix'
```

**Fix — Rewrite hoàn toàn:**
```js
import { apiClient } from '@/services/api'

export const getMaintenanceTickets = async ({ status, priority, search, page = 1, limit = 20 } = {}) => {
  const params = new URLSearchParams({ page, limit })
  if (status) params.set('status', status)
  if (priority) params.set('priority', priority)
  if (search) params.set('search', search)
  const res = await apiClient.get(`/api/maintenance?${params}`)
  // BE trả { success, data: { tickets } } — không có pagination hiện tại
  return {
    data: res?.data?.tickets || [],
    total: res?.data?.tickets?.length || 0,
  }
}

export const getMaintenanceTicket = async (ticketId) => {
  const res = await apiClient.get(`/api/maintenance/${ticketId}`)
  return res?.data?.ticket || null
}

export const reportMaintenanceIssue = async (data) => {
  const res = await apiClient.post('/api/maintenance', data)
  return res?.data?.ticket
}

export const updateMaintenanceTicket = async (ticketId, data) => {
  const res = await apiClient.put(`/api/maintenance/${ticketId}`, data)
  return res?.data?.ticket
}

export const closeMaintenanceTicket = async (ticketId) => {
  const res = await apiClient.patch(`/api/maintenance/${ticketId}/status`, { status: 'completed' })
  return res?.data?.ticket
}
```

---

#### FE-BUG-03 · `slipService.js` — Gọi bảng `assignment_slips` không tồn tại (🔴 Blocker)

**File:** `src/services/slipService.js`

```js
// HIỆN TẠI (SAI — bảng đã đổi tên hoàn toàn)
supabase.from('assignment_slips').select(...) // ← KHÔNG TỒN TẠI
```

Bảng thực tế: `handover_slips` + `handover_slip_items`. API endpoint: `/api/handover`.

**Fix — Rewrite hoàn toàn:**
```js
import { apiClient } from '@/services/api'

export const getAssignmentSlips = async ({ status, slip_type, page = 1, limit = 20 } = {}) => {
  const params = new URLSearchParams({ page, limit })
  if (status) params.set('status', status)
  if (slip_type) params.set('slip_type', slip_type)
  const res = await apiClient.get(`/api/handover?${params}`)
  return {
    data: res?.data?.slips || [],
    total: res?.data?.pagination?.total || 0,
  }
}

export const getAssignmentSlip = async (slipId) => {
  const res = await apiClient.get(`/api/handover/${slipId}`)
  return res?.data?.slip || null
}

export const createAssignmentSlip = async (data) => {
  // data: { to_employee_code, asset_ids: [], notes }
  const res = await apiClient.post('/api/handover', data)
  return res?.data?.slip
}

export const createReturnSlip = async (data) => {
  // data: { asset_ids: [], notes }
  const res = await apiClient.post('/api/handover/return', data)
  return res?.data?.slip
}

export const approveAssignmentSlip = async (slipId) => {
  const res = await apiClient.patch(`/api/handover/${slipId}/status`, { status: 'signed' })
  return res?.data?.slip
}
```

---

#### FE-BUG-04 · `reportService.js` — Hard-code data, gọi Supabase trực tiếp (🔴 Blocker)

**File:** `src/services/reportService.js`

Toàn bộ file gọi `supabase.from(...)` với các bảng không tồn tại trên Supabase. `ReportsPage.jsx` hiện dùng mock data tĩnh.

**Fix — Rewrite hoàn toàn:**
```js
import { apiClient } from '@/services/api'

export const getAssetListReport = async (filters = {}) => {
  const res = await apiClient.post('/api/reports/assets', { ...filters, reportType: 'detail' })
  return { data: res?.data?.reportData?.assets || [], total: res?.data?.reportData?.assets?.length || 0 }
}

export const getAssetMaintenanceReport = async (filters = {}) => {
  const res = await apiClient.post('/api/reports/maintenance', filters)
  return res?.data?.reportData || {}
}

export const getUserAssetAllocationReport = async (filters = {}) => {
  const res = await apiClient.post('/api/reports/users', filters)
  return { data: res?.data?.reportData || {} }
}
```

---

#### FE-BUG-05 · `MaintenancePage.jsx` — Response parse sai + mutation bug (🔴 Blocker)

**File:** `src/pages/MaintenancePage.jsx`

```jsx
// HIỆN TẠI (SAI — 3 bugs trong 1 trang)

// Bug 1: parse sai response
<MaintenanceList records={data?.records || []} />
// BE trả data.data.tickets, FE đọc data.records → luôn rỗng

// Bug 2: useMaintenance() dùng nhầm làm mutation trong CreateMaintenanceModal
const { mutate: create } = useMaintenance()
// ↑ useMaintenance là useQuery (GET), không phải useMutation

// Bug 3: schema FE form dùng 'asset_code' nhưng BE schema expect 'asset_id' (UUID)
```

**Fix:**
```jsx
// Fix 1: parse đúng
<MaintenanceList records={data?.data?.tickets || []} />

// Fix 2: dùng đúng hook
import { useReportMaintenanceIssue } from '@/hooks/useMaintenance'
const { mutate: create } = useReportMaintenanceIssue()

// Fix 3: CreateMaintenanceModal phải submit asset_id (UUID), không phải asset_code
// Cần load danh sách assets bằng useAssets() và map asset_code → asset.id trước khi submit
```

---

#### FE-BUG-06 · `SettingsPage.jsx` — `logout` function không tồn tại (🔴 Runtime crash)

**File:** `src/pages/SettingsPage.jsx`

```jsx
const { user, logout } = useAuth()
// ↑ useAuth trả về { signOut } không phải { logout }
// Click "Đăng xuất" trong Settings → crash: logout is not a function
```

**Fix:**
```jsx
const { user, signOut } = useAuth()
// Nút đăng xuất:
<Button onClick={signOut}>Đăng xuất</Button>
```

---

#### FE-BUG-07 · `AuthContext.jsx` — `API_BASE_URL` có `/api` ở cuối gây double prefix (🔴 Blocker)

**File:** `src/contexts/AuthContext.jsx`

```js
// HIỆN TẠI (SAI)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api'
// → fetch(`${API_BASE_URL}/api/auth/me`) = 'http://localhost:3004/api/api/auth/me' ← DOUBLE /api
```

**Fix:**
```js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004'
// → fetch(`${API_BASE_URL}/api/auth/me`) = 'http://localhost:3004/api/auth/me' ✅
```

Ngoài ra `routes/auth.js` trả `{ user: req.user }` nhưng AuthContext đọc `data.user` — cần verify đang match.

---

### 2.3. 🟠 Bugs trung bình

---

#### FE-BUG-08 · `AssetDetailPage.jsx` — Các nút action không có onClick (🟠 High UX)

3 nút Chỉnh sửa / Phân công / Thanh lý thiếu hoàn toàn `onClick` handler và state quản lý modal.

**Fix:**
```jsx
// Thêm vào AssetDetailPage.jsx
import { EditAssetModal } from '@/components/assets/EditAssetModal'
import { AssignAssetModal } from '@/components/assets/AssignAssetModal'
import { ReturnAssetModal } from '@/components/assets/ReturnAssetModal'

const [editingAsset, setEditingAsset] = useState(null)
const [assigningAsset, setAssigningAsset] = useState(null)
const [returningAsset, setReturningAsset] = useState(null)

// Wire vào từng nút:
<Button onClick={() => setEditingAsset(asset)}>Chỉnh sửa</Button>
<Button onClick={() => setAssigningAsset(asset)}>Phân công</Button>
<Button onClick={() => setReturningAsset(asset)}>Thu hồi</Button>

// Cuối JSX:
<EditAssetModal isOpen={!!editingAsset} onClose={() => setEditingAsset(null)} asset={editingAsset} />
<AssignAssetModal isOpen={!!assigningAsset} onClose={() => setAssigningAsset(null)} asset={assigningAsset} />
<ReturnAssetModal isOpen={!!returningAsset} onClose={() => setReturningAsset(null)} asset={returningAsset} />
```

---

#### FE-BUG-09 · `assetService.js` — `uploadAssetImages` dynamic import sai cú pháp (🟠 High)

```js
// HIỆN TẠI (SAI — crash khi gọi)
const { data: { session } } = await import('@/services/api').then(m => m.supabase.auth.getSession())
// import() trả về module, không phải kết quả của getSession()
```

**Fix:**
```js
import { supabase } from '@/services/api' // static import ở đầu file
export const uploadAssetImages = async (assetId, files = []) => {
  const { data: { session } } = await supabase.auth.getSession()
  const formData = new FormData()
  files.forEach(file => formData.append('images', file))
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || 'http://localhost:3004'}/api/assets/${assetId}/images`,
    { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` }, body: formData }
  )
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
  return response.json()
}
```

---

#### FE-BUG-10 · Format giá tiền sai (🟠 Medium — từ bug-tracker)

Postgres `numeric(15,2)` trả về dạng string `"20000000.00"` → `.toLocaleString()` parse không đúng.

**Fix** (`formatters.js` + mọi nơi hiển thị tiền):
```js
// src/utils/formatters.js — THÊM
export const formatVND = (value) => {
  if (!value && value !== 0) return '—'
  return new Intl.NumberFormat('vi-VN').format(parseFloat(value)) + ' ₫'
}
```

Cập nhật `AssetsList.jsx`, `AssetDetailPage.jsx`, `InvoicesList.jsx` dùng `formatVND(asset.purchase_price)`.

---

#### FE-BUG-11 · `AssetsList.jsx` — Thiếu nút Xóa (🟠 Medium — từ bug-tracker)

Hook `useDeleteAsset` và service `deleteAsset` đã có nhưng chưa wire vào UI.

**Fix:**
```jsx
// AssetsList.jsx — thêm prop onDelete + nút Xóa (chỉ với available assets + it_admin)
{!isRegularUser && asset.status === 'available' && (
  <Button variant="ghost" size="sm" onClick={() => onDelete(asset)} className="text-red-500">
    <Trash2 className="w-4 h-4" />
  </Button>
)}
```

---

#### FE-BUG-12 · `AssetForm.jsx` — Thiếu field chọn hóa đơn (🟠 High — core business — từ bug-tracker)

`assets.invoice_id` là FK bắt buộc trong nhiều workflow. Form tạo tài sản không có field chọn hóa đơn.

**Fix:**
```jsx
// AssetForm.jsx — thêm sau khi invoiceService được rewrite
import { useInvoiceOptions } from '@/hooks/useInvoices' // hook nhẹ chỉ lấy list cho dropdown
const { data: invoices = [] } = useInvoiceOptions()

// Thêm vào Zod schema:
invoice_id: z.string().uuid().optional().nullable()

// Thêm vào JSX:
<Select {...register('invoice_id')}>
  <option value="">-- Không gắn hóa đơn --</option>
  {invoices.map(inv => (
    <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.vendor_name}</option>
  ))}
</Select>
```

---

#### FE-BUG-13 · `pdfGenerators.js` — `require()` trong ESM (🟠 High)

```js
// HIỆN TẠI (SAI — crash khi gọi 2 hàm)
export const generateDisposalReport = (assets) => {
  const { jsPDF } = require('jspdf') // ReferenceError: require is not defined
}
```

**Fix:**
```js
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

---

#### FE-BUG-14 · `AssetHistoryPage.jsx` — navigate dùng `asset_code` thay vì UUID (🟡 Medium)

```jsx
// HIỆN TẠI (SAI)
navigate(`/assets/${asset.asset_code}`) // → /assets/SL.MAC01 → 404 vì route expect UUID
// AssetsPage.jsx đúng:
navigate(`/assets/${asset.id}`) // → /assets/uuid → ✅
```

**Fix:**
```jsx
navigate(`/assets/${asset.id}`)
```

---

#### FE-BUG-15 · `ReturnAssetModal.jsx` — Dropdown phòng ban luôn rỗng (🟡 Medium)

```jsx
import { DEPARTMENTS } from '@/utils/constants'
// DEPARTMENTS = [] (rỗng!) — cố ý để không break import
```

**Fix:**
```jsx
import { useDepartments } from '@/hooks/useDepartments'
const { departments = [] } = useDepartments()
// Thay {DEPARTMENTS.map(...)} bằng {departments.map(...)}
```

---

### 2.4. 🟡 Cần làm nhưng không block

| # | Vấn đề | File | Mức độ |
|---|---|---|---|
| FE-16 | Security: `console.log` token ra production | `api.js` | 🔴 Security |
| FE-17 | `SlipForm.jsx` cần rewrite để dùng `asset_ids[]` (UUID array) thay `asset_code` | `SlipForm.jsx` | 🟠 High |
| FE-18 | `SlipsList.jsx` dùng cột `slip_number`, `assigned_to_name` không khớp response BE | `SlipsList.jsx` | 🟠 High |
| FE-19 | `SlipDetailModal.jsx` dùng `slip_number`, `assigned_to_name` — phải map lại | `SlipDetailModal.jsx` | 🟠 High |
| FE-20 | `AddAssetModal.jsx` — sau khi tạo thành công nên redirect tới detail để upload ảnh | `AddAssetModal.jsx` | 🟡 Medium |
| FE-21 | `AssetForm.jsx` — preview format tiền khi nhập | `AssetForm.jsx` | 🟡 Low |
| FE-22 | `DashboardPage.jsx` — có `DatabaseSetup` và `TestSupabase` component render production | `DashboardPage.jsx` | 🔴 Security |
| FE-23 | `UserDetailModal.jsx` hiển thị `user.department` (text) nhưng FE nên dùng `department_name` từ join | `UserDetailModal.jsx` | 🟡 Medium |
| FE-24 | `ReportsPage.jsx` — mock data, cần nối `apiClient.post('/api/reports/*')` | `ReportsPage.jsx` | 🟡 Medium |
| FE-25 | `ProfilePage.jsx` — hoàn toàn trống, chưa implement | `ProfilePage.jsx` | ⏸ Low |
| FE-26 | Resolve git conflict marker trong `README.md` và `.gitignore` | root files | 🟡 Dev hygiene |
| FE-27 | `MaintenanceDetailModal.jsx` — status labels không khớp: dùng `open/in_progress/resolved/closed` thay vì `pending/in_progress/completed/cannot_fix` | `MaintenanceDetailModal.jsx` | 🟠 High |

---

## 3. Lộ trình fix theo Sprint

### 🔴 Sprint 1 — Blockers, xong trong 1 ngày (tổng ~6 giờ)

| # | Bug | File | Effort |
|---|---|---|---|
| BE-BUG-01 | Role names sai trong invoices | `routes/invoices.js` | 10 phút |
| BE-BUG-02 | Role names sai trong maintenance | `routes/maintenance.js` | 10 phút |
| BE-BUG-03 | Role names sai trong reports | `routes/reports.js` | 10 phút |
| FE-BUG-07 | Double `/api` prefix AuthContext | `AuthContext.jsx` | 5 phút |
| FE-BUG-06 | `logout` → `signOut` crash Settings | `SettingsPage.jsx` | 5 phút |
| FE-BUG-16 | Security: xóa console.log token | `api.js` | 15 phút |
| FE-BUG-22 | Gỡ DatabaseSetup/TestSupabase khỏi Dashboard | `DashboardPage.jsx` | 10 phút |
| FE-BUG-01 | Rewrite invoiceService → apiClient | `invoiceService.js` | 2 giờ |
| FE-BUG-02 | Rewrite maintenanceService → apiClient | `maintenanceService.js` | 2 giờ |
| FE-BUG-03 | Rewrite slipService → apiClient | `slipService.js` | 1 giờ |

---

### 🟠 Sprint 2 — High Impact, 2-3 ngày (~12 giờ)

| # | Bug | File | Effort |
|---|---|---|---|
| BE-BUG-06 | Fix assign/return dùng handover_slip_items | `routes/assets.js` | 1 giờ |
| BE-BUG-04 | Fix generate_ticket_number hoặc tạo SQL function | `routes/maintenance.js` | 30 phút |
| BE-BUG-05 | Thay v_assets_full bằng query trực tiếp | `routes/reports.js` | 30 phút |
| BE-BUG-07 | Thêm filter+pagination vào GET /invoices | `routes/invoices.js` | 1 giờ |
| BE-BUG-09 | Fix GET /maintenance trả đúng field + pagination | `routes/maintenance.js` | 30 phút |
| FE-BUG-05 | Fix MaintenancePage parse response + mutation bug | `MaintenancePage.jsx` | 1 giờ |
| FE-BUG-08 | Wire modals trong AssetDetailPage | `AssetDetailPage.jsx` | 1.5 giờ |
| FE-BUG-09 | Fix uploadAssetImages dynamic import | `assetService.js` | 20 phút |
| FE-BUG-13 | Fix require() → dynamic import PDF | `pdfGenerators.js` | 30 phút |
| FE-BUG-10 | Format VNĐ đúng chuẩn | `formatters.js` + 3 files | 45 phút |
| FE-BUG-11 | Thêm nút Xóa tài sản vào AssetsList | `AssetsList.jsx` + `AssetsPage.jsx` | 1 giờ |
| FE-BUG-17/18/19 | Rewrite SlipForm/SlipsList/SlipDetailModal | 3 files | 3 giờ |
| FE-BUG-27 | Fix status labels maintenance | `MaintenanceDetailModal.jsx` | 20 phút |

---

### 🟡 Sprint 3 — Polish & Complete, 3-5 ngày (~15 giờ)

| # | Bug/Feature | File | Effort |
|---|---|---|---|
| BE-BUG-10 | Implement upload ảnh tài sản (Phase 5A) | `middleware/upload.js` + `routes/assets.js` | 2 giờ |
| FE-BUG-12 | Thêm field invoice_id vào AssetForm | `AssetForm.jsx` + `useInvoices.js` | 2 giờ |
| FE-BUG-15 | ReturnAssetModal dropdown phòng ban | `ReturnAssetModal.jsx` | 30 phút |
| FE-BUG-14 | Navigate dùng UUID nhất quán | `AssetHistoryPage.jsx` | 5 phút |
| FE-BUG-04 | Rewrite reportService + nối ReportsPage | `reportService.js` + `ReportsPage.jsx` | 3 giờ |
| FE-BUG-20 | AddAssetModal redirect sau tạo thành công | `AddAssetModal.jsx` | 30 phút |
| FE-BUG-21 | Preview format tiền khi nhập | `AssetForm.jsx` | 30 phút |
| FE-BUG-23 | UserDetailModal hiển thị department_name | `UserDetailModal.jsx` | 20 phút |
| FE-BUG-24 | Nối ReportsPage với API thật | `ReportsPage.jsx` | 2 giờ |
| BE-BUG-08 | Xóa file route cũ (cleanup) | `allocation_slips.js`, `return_slips.js` | 5 phút |
| FE-26 | Resolve git conflict README + .gitignore | root | 15 phút |

---

### ⏸ Sprint 4 — Tính năng mới & hoàn thiện

| Item | Ghi chú |
|---|---|
| BE Phase 5B: `lib/auditLog.js` | Ghi audit sau mỗi action quan trọng |
| BE Phase 5C: `lib/AppError.js` | Chuẩn hóa error handling |
| BE Phase 5D: `routes/reports.js` clarify asset_history vs audit_log | |
| BE Phase 5E: Rate limiting (`express-rate-limit`) | Cần trước khi production deploy |
| FE: `ProfilePage.jsx` | Implement logic thật |
| FE: `SettingsPage.jsx` | Nối đổi password (Supabase Auth) + lưu preference |
| FE: Phân trang thật cho AssetHistoryPage/UserHistoryPage | |
| FE: DisposalAssetModal | Flow thanh lý tài sản đầy đủ |

---

## 4. Tổng hợp File cần sửa

### Backend

| File | Bugs cần fix | Effort |
|---|---|---|
| `routes/invoices.js` | BE-01, BE-07 | 1.5 giờ |
| `routes/maintenance.js` | BE-02, BE-04, BE-09 | 1 giờ |
| `routes/reports.js` | BE-03, BE-05 | 45 phút |
| `routes/assets.js` | BE-06, BE-10 | 2 giờ |
| `middleware/upload.js` | BE-10 (tạo mới) | 1 giờ |
| `routes/allocation_slips.js` | BE-08 (xóa) | — |
| `routes/return_slips.js` | BE-08 (xóa) | — |

### Frontend — Services (rewrite)

| File | Bugs cần fix | Effort |
|---|---|---|
| `src/services/invoiceService.js` | FE-01 (rewrite) | 2 giờ |
| `src/services/maintenanceService.js` | FE-02 (rewrite) | 2 giờ |
| `src/services/slipService.js` | FE-03 (rewrite) | 1 giờ |
| `src/services/reportService.js` | FE-04 (rewrite) | 1 giờ |
| `src/services/assetService.js` | FE-09 | 20 phút |
| `src/services/api.js` | FE-16 (security) | 15 phút |

### Frontend — Pages

| File | Bugs cần fix | Effort |
|---|---|---|
| `src/pages/MaintenancePage.jsx` | FE-05 | 1 giờ |
| `src/pages/AssetDetailPage.jsx` | FE-08 | 1.5 giờ |
| `src/pages/AssetHistoryPage.jsx` | FE-14 | 5 phút |
| `src/pages/DashboardPage.jsx` | FE-22 (security) | 10 phút |
| `src/pages/SettingsPage.jsx` | FE-06 | 5 phút |
| `src/pages/ReportsPage.jsx` | FE-24 | 2 giờ |

### Frontend — Components

| File | Bugs cần fix | Effort |
|---|---|---|
| `src/components/assets/AssetForm.jsx` | FE-12, FE-21 | 2 giờ |
| `src/components/assets/AssetsList.jsx` | FE-10, FE-11 | 1 giờ |
| `src/components/assets/ReturnAssetModal.jsx` | FE-15 | 30 phút |
| `src/components/assets/AddAssetModal.jsx` | FE-20 | 30 phút |
| `src/components/slips/SlipForm.jsx` | FE-17 | 1 giờ |
| `src/components/slips/SlipsList.jsx` | FE-18 | 45 phút |
| `src/components/slips/SlipDetailModal.jsx` | FE-19 | 30 phút |
| `src/components/maintenance/MaintenanceDetailModal.jsx` | FE-27 | 20 phút |
| `src/components/users/UserDetailModal.jsx` | FE-23 | 20 phút |

### Frontend — Utils & Hooks

| File | Bugs cần fix | Effort |
|---|---|---|
| `src/utils/formatters.js` | FE-10 (thêm formatVND) | 15 phút |
| `src/utils/pdfGenerators.js` | FE-13 | 30 phút |
| `src/contexts/AuthContext.jsx` | FE-07 | 5 phút |
| `src/hooks/useInvoices.js` | FE-12 (thêm useInvoiceOptions) | 30 phút |

---

## 5. Checklist trước khi deploy production

```
Security (P0 - BẮT BUỘC)
[ ] Xóa/guard tất cả console.log token trong api.js (FE-16)
[ ] Gỡ DatabaseSetup.jsx và TestSupabase.jsx khỏi DashboardPage (FE-22)
[ ] Đảm bảo NODE_ENV=production trong .env production

Backend (P0 - BẮT BUỘC)
[ ] Fix role names trong invoices.js, maintenance.js, reports.js (BE-01/02/03)
[ ] Fix handover_slip_items trong assets.js assign/return (BE-06)
[ ] Verify generate_ticket_number() function tồn tại trên VPS (BE-04)
[ ] Xác nhận view v_assets_full tồn tại hoặc thay bằng query trực tiếp (BE-05)

Frontend Services (P0 - BẮT BUỘC)
[ ] Rewrite invoiceService.js → apiClient (FE-01)
[ ] Rewrite maintenanceService.js → apiClient (FE-02)
[ ] Rewrite slipService.js → apiClient (FE-03)
[ ] Fix logout → signOut trong SettingsPage (FE-06)
[ ] Fix API_BASE_URL double /api trong AuthContext (FE-07)

Frontend UX (P1 - CẦN THIẾT)
[ ] Wire modals trong AssetDetailPage (FE-08)
[ ] Fix parse response MaintenancePage (FE-05)
[ ] Fix format VNĐ đúng chuẩn (FE-10)
[ ] Fix pdfGenerators require → dynamic import (FE-13)

Cleanup (P2 - TRƯỚC KHI MERGE)
[ ] Xóa routes/allocation_slips.js và routes/return_slips.js (BE-08)
[ ] Resolve git conflict README.md và .gitignore
[ ] Dọn console.log debug trong toàn bộ src/
[ ] Build thành công không có warning
```

---

*Phân tích bởi Claude — 20/06/2026.*  
*Dựa trên: Code review trực tiếp toàn bộ `be/` và `fe/src/` + bug-tracker.xlsx (9 bugs) + PHAN_TICH_TIEN_DO_FRONTEND_update.md + BE_ANALYSIS_REFACTOR_v2.md*

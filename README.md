# Backend Quản lý Nhân sự - Hướng dẫn

## Cấu trúc file

### server.js - File chính
Chứa tất cả API endpoints cho ứng dụng quản lý nhân sự.

### db.js - Kết nối MySQL
- Dùng `MYSQL_URL` (Railway) hoặc kết nối local (localhost:3306)
- Database: `quanlynhansu` (local) hoặc `railway` (cloud)

### vntime.js - Xử lý múi giờ Việt Nam
- Chuyển đổi UTC sang giờ Việt Nam (UTC+7)
- Dùng cho check-in/check-out chấm công

---

## Danh sách API Endpoints

### 1. Kiểm tra kết nối
- `GET /api/health` - Kiểm tra server hoạt động

### 2. Nhân viên (Employees)
- `GET /api/employees` - Lấy danh sách tất cả nhân viên
- `POST /api/employees` - Thêm hoặc cập nhật nhân viên
- `DELETE /api/employees/:id` - Xóa nhân viên

### 3. Phòng ban (Departments)
- `GET /api/departments` - Lấy danh sách phòng ban
- `POST /api/departments` - Thêm phòng ban mới
- `PUT /api/departments` - Đổi tên phòng ban
- `DELETE /api/departments/:name` - Xóa phòng ban

### 4. Ghi chú công việc (Work Notes)
- `GET /api/notes` - Lấy tất cả ghi chú
- `POST /api/notes` - Thêm/cập nhật ghi chú
- `DELETE /api/notes/:id` - Xóa ghi chú

### 5. Chấm công (Attendance)
- `GET /api/attendance` - Lấy dữ liệu chấm công tất cả ngày
- `POST /api/attendance` - Lưu chấm công theo ngày
- `POST /api/attendance/checkin` - Nhân viên check-in bằng ảnh
- `POST /api/attendance/checkout` - Nhân viên check-out bằng ảnh
- `GET /api/attendance/status/:employeeId/:date` - Lấy trạng thái check-in/out
- `POST /api/attendance/photo` - Upload ảnh chấm công (legacy)

### 6. Đơn nghỉ phép (Leave Requests)
- `GET /api/leave-requests` - Lấy danh sách đơn (lọc theo employeeId, status)
- `POST /api/leave-requests` - Tạo đơn nghỉ phép mới
- `PATCH /api/leave-requests/:id/review` - Quản lý duyệt/từ chối đơn
- `DELETE /api/leave-requests/:id` - Xóa đơn nghỉ phép

### 7. Đồng bộ dữ liệu
- `POST /api/sync/import` - Nhập toàn bộ dữ liệu từ app

### 8. Xác thực (Authentication)
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/register` - Quản lý tạo tài khoản cho nhân viên
- `POST /api/auth/reset-password` - Đặt lại mật khẩu
- `GET /api/auth/check-email/:email` - Kiểm tra email đã đăng ký

---

## Quy tắc chấm công
- Check-in trước 8:00 sáng → Đúng giờ (present)
- Check-in sau 8:00 sáng → Đi muộn (late)
- Check-out sau 16:00 → 1 ngày công (present)
- Check-out trước 16:00 → Nửa ngày công (half_day)

## Lưu trữ ảnh
- Ảnh chấm công được upload lên **Cloudinary** (cloud storage)
- URL ảnh lưu trong cột `checkin_photo`, `checkout_photo` của bảng `attendance`

## Chạy local
```bash
cd backend
npm install
npm start
```
Server chạy tại: http://localhost:3000

## Biến môi trường (Railway)
- `MYSQL_URL` - Connection string MySQL
- `CLOUDINARY_CLOUD_NAME` - Tên cloud Cloudinary
- `CLOUDINARY_API_KEY` - API Key Cloudinary
- `CLOUDINARY_API_SECRET` - API Secret Cloudinary
- `PORT` - Port server (mặc định 3000)

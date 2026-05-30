-- Khởi tạo Database
CREATE DATABASE IF NOT EXISTS quanlynhansu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE quanlynhansu;

-- 1. Bảng Users (Quản trị viên & Nhân viên)
CREATE TABLE IF NOT EXISTS users (
    email VARCHAR(255) PRIMARY KEY,
    fullName VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    password VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bảng Departments (Phòng ban)
CREATE TABLE IF NOT EXISTS departments (
    name VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Thêm một số phòng ban mặc định
INSERT IGNORE INTO departments (name) VALUES ('Mặc định'), ('Hành chính'), ('Kỹ thuật'), ('Kinh doanh'), ('Nhân sự');

-- 3. Bảng Employees (Nhân viên)
CREATE TABLE IF NOT EXISTS employees (
    id VARCHAR(50) PRIMARY KEY,
    employeeCode VARCHAR(50) UNIQUE NOT NULL,
    fullName VARCHAR(255) NOT NULL,
    gender VARCHAR(10) NOT NULL DEFAULT 'Nam',
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    address TEXT NOT NULL,
    department VARCHAR(255) NOT NULL,
    position VARCHAR(255) NOT NULL,
    joinDate DATETIME NOT NULL,
    salary DOUBLE NOT NULL DEFAULT 0.0,
    bonus DOUBLE NOT NULL DEFAULT 0.0,
    penalty DOUBLE NOT NULL DEFAULT 0.0,
    notes TEXT NULL,
    weeklySchedule TEXT NULL, -- Lưu trữ dưới dạng JSON String (ví dụ: {"Monday": "08:00 - 17:00", ...})
    profileData TEXT NULL, -- Luu ho so nhan vien mo rong dang JSON
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department) REFERENCES departments(name) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bảng Work Notes (Ghi chú công việc)
CREATE TABLE IF NOT EXISTS work_notes (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    date DATETIME NOT NULL,
    employeeId VARCHAR(50) NULL,
    department VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE SET NULL,
    FOREIGN KEY (department) REFERENCES departments(name) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bảng Attendance (Điểm danh)
CREATE TABLE IF NOT EXISTS attendance (
    id VARCHAR(50) PRIMARY KEY,
    employeeId VARCHAR(50) NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'present', -- 'present', 'absent', 'late', 'half_day'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_employee_date (employeeId, date), -- Mỗi nhân viên chỉ điểm danh 1 lần 1 ngày
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bảng Đơn nghỉ phép
CREATE TABLE IF NOT EXISTS leave_requests (
    id VARCHAR(50) PRIMARY KEY,
    employeeId VARCHAR(50) NOT NULL,
    employeeName VARCHAR(255) NOT NULL,
    employeeEmail VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    leaveType VARCHAR(100) NOT NULL DEFAULT 'Nghỉ phép năm',
    startDate DATE NOT NULL,
    endDate DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewNote TEXT NULL,
    reviewedBy VARCHAR(255) NULL,
    reviewedAt DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

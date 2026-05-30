const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Auto-migrate: thêm các cột cần thiết cho chấm công ảnh và trạng thái việc
(async () => {
  try {
    const [attendanceCols] = await db.query(`SHOW COLUMNS FROM attendance`);
    const attendanceColNames = attendanceCols.map(c => c.Field);
    const attendanceToAdd = [
      { name: 'photo_url', def: 'VARCHAR(500) DEFAULT NULL' },
      { name: 'checkin_time', def: 'DATETIME DEFAULT NULL' },
      { name: 'checkout_time', def: 'DATETIME DEFAULT NULL' },
      { name: 'checkin_photo', def: 'VARCHAR(500) DEFAULT NULL' },
      { name: 'checkout_photo', def: 'VARCHAR(500) DEFAULT NULL' },
    ];
    for (const col of attendanceToAdd) {
      if (!attendanceColNames.includes(col.name)) {
        await db.query(`ALTER TABLE attendance ADD COLUMN ${col.name} ${col.def}`);
        console.log(`✅ Added column: ${col.name}`);
      }
    }

    const [noteCols] = await db.query(`SHOW COLUMNS FROM work_notes`);
    const noteColNames = noteCols.map(c => c.Field);
    if (!noteColNames.includes('completedByEmployee')) {
      await db.query(`ALTER TABLE work_notes ADD COLUMN completedByEmployee TINYINT(1) NOT NULL DEFAULT 0`);
      console.log('✅ Added column: completedByEmployee');
    }

    const [employeeCols] = await db.query(`SHOW COLUMNS FROM employees`);
    const employeeColNames = employeeCols.map(c => c.Field);
    if (!employeeColNames.includes('profileData')) {
      await db.query(`ALTER TABLE employees ADD COLUMN profileData TEXT NULL`);
      console.log('Added column: profileData');
    }
  } catch (e) {
    console.error('Migration error:', e.message);
  }
})();

// API Kiểm tra kết nối
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend Server kết nối MySQL hoạt động bình thường!' });
});

// ==========================================
// 1. APIs CHO NHÂN VIÊN (EMPLOYEES)
// ==========================================

// Lấy danh sách tất cả nhân viên
app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM employees');
    // Chuyển đổi weeklySchedule từ JSON string thành object trước khi gửi về client
    const employees = rows.map(emp => ({
      ...emp,
      weeklySchedule: emp.weeklySchedule ? JSON.parse(emp.weeklySchedule) : null,
      profileFields: emp.profileData ? JSON.parse(emp.profileData) : {}
    }));
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: error.message });
  }
});

// Thêm hoặc cập nhật một nhân viên (INSERT ... ON DUPLICATE KEY UPDATE)
app.post('/api/employees', async (req, res) => {
  const emp = req.body;
  const scheduleStr = emp.weeklySchedule ? JSON.stringify(emp.weeklySchedule) : null;
  const profileDataStr = emp.profileFields ? JSON.stringify(emp.profileFields) : null;
  const joinDate = emp.joinDate ? new Date(emp.joinDate) : new Date();

  const query = `
    INSERT INTO employees (
      id, employeeCode, fullName, gender, email, phone, address, 
      department, position, joinDate, salary, bonus, penalty, notes, weeklySchedule, profileData
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      employeeCode = VALUES(employeeCode),
      fullName = VALUES(fullName),
      gender = VALUES(gender),
      email = VALUES(email),
      phone = VALUES(phone),
      address = VALUES(address),
      department = VALUES(department),
      position = VALUES(position),
      joinDate = VALUES(joinDate),
      salary = VALUES(salary),
      bonus = VALUES(bonus),
      penalty = VALUES(penalty),
      notes = VALUES(notes),
      weeklySchedule = VALUES(weeklySchedule),
      profileData = VALUES(profileData)
  `;

  const values = [
    emp.id, emp.employeeCode, emp.fullName, emp.gender, emp.email, emp.phone, emp.address,
    emp.department, emp.position, joinDate, emp.salary, emp.bonus || 0, emp.penalty || 0,
    emp.notes || null, scheduleStr, profileDataStr
  ];

  try {
    // Đảm bảo phòng ban tồn tại trước khi chèn nhân viên để tránh lỗi khóa ngoại
    await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [emp.department]);

    await db.query(query, values);
    res.json({ success: true, message: 'Lưu thông tin nhân viên thành công!' });
  } catch (error) {
    console.error('Error saving employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// Xóa nhân viên
app.delete('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM employees WHERE id = ?', [id]);
    res.json({ success: true, message: 'Xóa nhân viên thành công!' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 2. APIs CHO PHÒNG BAN (DEPARTMENTS)
// ==========================================

// Lấy danh sách tất cả phòng ban
app.get('/api/departments', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT name FROM departments');
    res.json(rows.map(r => r.name));
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: error.message });
  }
});

// Thêm phòng ban mới
app.post('/api/departments', async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Tên phòng ban không được trống' });
  }
  try {
    await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name.trim()]);
    res.json({ success: true, message: 'Thêm phòng ban thành công!' });
  } catch (error) {
    console.error('Error saving department:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cập nhật tên phòng ban
app.put('/api/departments', async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: 'Thiếu tên phòng ban cũ hoặc mới' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Thêm phòng ban mới nếu chưa có
    await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [newName]);

    // Cập nhật nhân viên thuộc phòng ban cũ sang mới
    await connection.query('UPDATE employees SET department = ? WHERE department = ?', [newName, oldName]);

    // Cập nhật ghi chú thuộc phòng ban cũ sang mới
    await connection.query('UPDATE work_notes SET department = ? WHERE department = ?', [newName, oldName]);

    // Xóa phòng ban cũ (nếu không phải là phòng ban mới)
    if (oldName !== newName) {
      await connection.query('DELETE FROM departments WHERE name = ?', [oldName]);
    }

    await connection.commit();
    res.json({ success: true, message: 'Cập nhật phòng ban thành công!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating department:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Xóa phòng ban
app.delete('/api/departments/:name', async (req, res) => {
  const { name } = req.params;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Chuyển toàn bộ nhân viên ở phòng ban này về phòng ban 'Mặc định'
    await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', ['Mặc định']);
    await connection.query('UPDATE employees SET department = ? WHERE department = ?', ['Mặc định', name]);
    await connection.query('UPDATE work_notes SET department = ? WHERE department = ?', ['Mặc định', name]);

    // Xóa phòng ban
    await connection.query('DELETE FROM departments WHERE name = ?', [name]);

    await connection.commit();
    res.json({ success: true, message: 'Xóa phòng ban thành công!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting department:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});


// ==========================================
// 3. APIs CHO GHI CHÚ (WORK NOTES)
// ==========================================

// Lấy danh sách tất cả ghi chú
app.get('/api/notes', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM work_notes');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Thêm hoặc cập nhật một ghi chú
app.post('/api/notes', async (req, res) => {
  const note = req.body;
  const noteDate = note.date ? new Date(note.date) : new Date();
  const completedByEmployee = note.completedByEmployee ? 1 : 0;

  const query = `
    INSERT INTO work_notes (id, title, description, date, employeeId, department, completedByEmployee)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      description = VALUES(description),
      date = VALUES(date),
      employeeId = VALUES(employeeId),
      department = VALUES(department),
      completedByEmployee = VALUES(completedByEmployee)
  `;

  const values = [
    note.id, note.title, note.description, noteDate,
    note.employeeId || null, note.department || null, completedByEmployee
  ];

  try {
    await db.query(query, values);
    res.json({ success: true, message: 'Lưu ghi chú thành công!' });
  } catch (error) {
    console.error('Error saving note:', error);
    res.status(500).json({ error: error.message });
  }
});

// Xóa ghi chú
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM work_notes WHERE id = ?', [id]);
    res.json({ success: true, message: 'Xóa ghi chú thành công!' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 4. APIs CHO ĐIỂM DANH (ATTENDANCE)
// ==========================================

// Lấy toàn bộ dữ liệu điểm danh
app.get('/api/attendance', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT employeeId, date, status FROM attendance');
    // Chuyển đổi sang cấu trúc Map<Date, Map<EmployeeId, Status>> giống Hive mong đợi
    // Cấu trúc: { "2026-05-17": { "emp1": "present", "emp2": "late" } }
    const attendanceMap = {};
    rows.forEach(row => {
      const dateStr = row.date.toISOString().split('T')[0];
      if (!attendanceMap[dateStr]) {
        attendanceMap[dateStr] = {};
      }
      attendanceMap[dateStr][row.employeeId] = row.status;
    });
    res.json(attendanceMap);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lưu thông tin điểm danh cho một ngày cụ thể
// Body: { "date": "2026-05-17", "attendance": { "emp_id_1": "present", "emp_id_2": "absent" } }
app.post('/api/attendance', async (req, res) => {
  const { date, attendance } = req.body;
  if (!date || !attendance) {
    return res.status(400).json({ error: 'Thiếu thông tin ngày hoặc danh sách điểm danh' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Lặp qua các cặp employeeId -> status để thêm/cập nhật
    for (const [employeeId, status] of Object.entries(attendance)) {
      const id = `${employeeId}_${date}`; // Tạo ID độc bản
      const query = `
        INSERT INTO attendance (id, employeeId, date, status)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)
      `;
      await connection.query(query, [id, employeeId, date, status]);
    }

    await connection.commit();
    res.json({ success: true, message: 'Lưu điểm danh thành công!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error saving attendance:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});


// ==========================================
// 5. ĐƠN NGHỈ PHÉP (LEAVE REQUESTS)
// ==========================================

app.get('/api/leave-requests', async (req, res) => {
  const { employeeId, status } = req.query;
  try {
    let query = 'SELECT * FROM leave_requests WHERE 1=1';
    const params = [];
    if (employeeId) {
      query += ' AND employeeId = ?';
      params.push(employeeId);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leave-requests', async (req, res) => {
  const {
    id, employeeId, employeeName, employeeEmail, department,
    leaveType, startDate, endDate, reason,
  } = req.body;

  if (!employeeId || !employeeName || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin đơn nghỉ phép' });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ error: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu' });
  }

  const requestId = id || `leave_${Date.now()}`;
  try {
    await db.query(
      `INSERT INTO leave_requests (
        id, employeeId, employeeName, employeeEmail, department,
        leaveType, startDate, endDate, reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        requestId, employeeId, employeeName, employeeEmail || '',
        department || 'Mặc định', leaveType || 'Nghỉ phép năm',
        startDate, endDate, reason,
      ]
    );
    const [rows] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [requestId]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/leave-requests/:id/review', async (req, res) => {
  const { adminEmail, status, reviewNote } = req.body;
  const { id } = req.params;

  if (!adminEmail || !status) {
    return res.status(400).json({ error: 'Thiếu thông tin duyệt đơn' });
  }
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Trạng thái duyệt không hợp lệ' });
  }

  try {
    const [admins] = await db.query('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (admins.length === 0 || admins[0].role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ quản lý mới được duyệt đơn' });
    }

    const [existing] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đơn nghỉ phép' });
    }
    if (existing[0].status !== 'pending') {
      return res.status(400).json({ error: 'Đơn này đã được xử lý trước đó' });
    }

    await db.query(
      `UPDATE leave_requests
       SET status = ?, reviewNote = ?, reviewedBy = ?, reviewedAt = NOW()
       WHERE id = ?`,
      [status, reviewNote || null, adminEmail, id]
    );

    const [rows] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    res.json(rows[0]);
  } catch (error) {
    console.error('Error reviewing leave request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Xóa đơn nghỉ phép (admin hoặc nhân viên xóa đơn pending của mình)
app.delete('/api/leave-requests/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đơn nghỉ phép' });
    }
    await db.query('DELETE FROM leave_requests WHERE id = ?', [id]);
    res.json({ success: true, message: 'Đã xóa đơn nghỉ phép' });
  } catch (error) {
    console.error('Error deleting leave request:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. ĐỒNG BỘ TOÀN BỘ BACKUP / RESTORE
// ==========================================

// Nhập/Đồng bộ hóa toàn bộ dữ liệu từ Client (Khi khởi động app lần đầu hoặc nhấn Đồng bộ)
app.post('/api/sync/import', async (req, res) => {
  const { employees, departments, notes, attendance } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Nhập Departments
    if (departments) {
      for (const deptVal of Object.values(departments)) {
        await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [deptVal]);
      }
    }

    // 2. Nhập Employees
    if (employees) {
      for (const empJsonStr of Object.values(employees)) {
        const emp = JSON.parse(empJsonStr);
        const scheduleStr = emp.weeklySchedule ? JSON.stringify(emp.weeklySchedule) : null;
        const profileDataStr = emp.profileFields ? JSON.stringify(emp.profileFields) : null;
        const joinDate = emp.joinDate ? new Date(emp.joinDate) : new Date();

        const query = `
          INSERT INTO employees (
            id, employeeCode, fullName, gender, email, phone, address,
            department, position, joinDate, salary, bonus, penalty, notes, weeklySchedule, profileData
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            employeeCode = VALUES(employeeCode),
            fullName = VALUES(fullName),
            gender = VALUES(gender),
            email = VALUES(email),
            phone = VALUES(phone),
            address = VALUES(address),
            department = VALUES(department),
            position = VALUES(position),
            joinDate = VALUES(joinDate),
            salary = VALUES(salary),
            bonus = VALUES(bonus),
            penalty = VALUES(penalty),
            notes = VALUES(notes),
            weeklySchedule = VALUES(weeklySchedule),
            profileData = VALUES(profileData)
        `;
        await connection.query(query, [
          emp.id, emp.employeeCode, emp.fullName, emp.gender, emp.email, emp.phone, emp.address,
          emp.department, emp.position, joinDate, emp.salary, emp.bonus || 0, emp.penalty || 0,
          emp.notes || null, scheduleStr, profileDataStr
        ]);
      }
    }

    // 3. Nhập Ghi chú (Notes)
    if (notes) {
      for (const noteJsonStr of Object.values(notes)) {
        const note = JSON.parse(noteJsonStr);
        const noteDate = note.date ? new Date(note.date) : new Date();

        const query = `
          INSERT INTO work_notes (id, title, description, date, employeeId, department)
          VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            description = VALUES(description),
            date = VALUES(date),
            employeeId = VALUES(employeeId),
            department = VALUES(department)
        `;
        await connection.query(query, [
          note.id, note.title, note.description, noteDate,
          note.employeeId || null, note.department || null
        ]);
      }
    }

    // 4. Nhập Điểm danh (Attendance)
    if (attendance) {
      for (const [dateKey, attendanceDataStr] of Object.entries(attendance)) {
        const attData = JSON.parse(attendanceDataStr);
        for (const [employeeId, status] of Object.entries(attData)) {
          const id = `${employeeId}_${dateKey}`;
          const query = `
            INSERT INTO attendance (id, employeeId, date, status)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE status = VALUES(status)
          `;
          await connection.query(query, [id, employeeId, dateKey, status]);
        }
      }
    }

    await connection.commit();
    res.json({ success: true, message: 'Đồng bộ hóa dữ liệu từ Client thành công!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error executing import sync:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 6. APIs HỆ THỐNG XÁC THỰC (AUTHENTICATION)
// ==========================================

// Quản lý tạo tài khoản đăng nhập cho nhân viên (nhân viên không tự đăng ký)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, fullName, adminEmail, employeeId } = req.body;
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
  }
  if (!adminEmail) {
    return res.status(403).json({ error: 'Chỉ quản lý mới được tạo tài khoản cho nhân viên' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [adminRows] = await connection.query(
      'SELECT role FROM users WHERE email = ?',
      [adminEmail]
    );
    if (adminRows.length === 0 || adminRows[0].role !== 'admin') {
      await connection.rollback();
      return res.status(403).json({ error: 'Bạn không có quyền tạo tài khoản' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await connection.query(
      'SELECT email FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Email đã có tài khoản đăng nhập' });
    }

    const role = 'employee';
    await connection.query(
      'INSERT INTO users (email, fullName, password, role) VALUES (?, ?, ?, ?)',
      [normalizedEmail, fullName, password, role]
    );

    if (employeeId) {
      const [emps] = await connection.query('SELECT id FROM employees WHERE id = ?', [employeeId]);
      if (emps.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Không tìm thấy hồ sơ nhân viên' });
      }
      await connection.query(
        'UPDATE employees SET email = ?, fullName = ? WHERE id = ?',
        [normalizedEmail, fullName, employeeId]
      );
    } else {
      const [existingEmp] = await connection.query(
        'SELECT id FROM employees WHERE email = ?',
        [normalizedEmail]
      );
      if (existingEmp.length === 0) {
        const deptName = 'Mặc định';
        await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [deptName]);
        const empId = `emp_${Date.now()}`;
        const empCode = `NV_${Math.floor(Math.random() * 10000)}`;
        await connection.query(
          `INSERT INTO employees
           (id, employeeCode, fullName, gender, email, phone, address, department, position, joinDate, salary, bonus, penalty, notes)
           VALUES (?, ?, ?, 'Nam', ?, '', '', ?, 'Nhân viên', NOW(), 0.0, 0.0, 0.0, '')`,
          [empId, empCode, fullName, normalizedEmail, deptName]
        );
      }
    }

    await connection.commit();
    res.json({ success: true, user: { email: normalizedEmail, fullName, role } });
  } catch (error) {
    await connection.rollback();
    console.error('Error registering user:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// Đăng nhập người dùng
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
  }
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email chưa được đăng ký trong hệ thống' });
    }
    const user = rows[0];
    if (user.password !== password) {
      return res.status(400).json({ error: 'Mật khẩu không chính xác' });
    }
    res.json({ success: true, user: { email: user.email, fullName: user.fullName, role: user.role } });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message });
  }
});

// Đặt lại mật khẩu
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Thiếu thông tin đặt lại mật khẩu' });
  }
  try {
    const [existing] = await db.query('SELECT email FROM users WHERE email = ?', [email]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Email không tồn tại trong hệ thống' });
    }
    await db.query('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);
    res.json({ success: true, message: 'Đặt lại mật khẩu thành công!' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kiểm tra email tồn tại
app.get('/api/auth/check-email/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const [rows] = await db.query('SELECT email FROM users WHERE email = ?', [email]);
    res.json({ registered: rows.length > 0 });
  } catch (error) {
    console.error('Error checking email:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// UPLOAD ẢNH CHẤM CÔNG
// ==========================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Tạo thư mục uploads nếu chưa có
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `attendance-${unique}.jpg`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chỉ chấp nhận file ảnh'));
  },
});

// Serve ảnh tĩnh
app.use('/uploads', express.static(uploadsDir));

function getBaseUrl(req) {
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return `${req.protocol}://${req.get('host')}`;
}

function getVnDateParts(date = new Date()) {
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return {
    dateKey: vn.toISOString().slice(0, 10),
    dateTime: vn.toISOString().replace('T', ' ').substring(0, 19),
    hour: vn.getUTCHours(),
    minute: vn.getUTCMinutes(),
  };
}

// CHECK-IN bằng ảnh
app.post('/api/attendance/checkin', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiếu employeeId' });

    const { dateKey, dateTime, hour, minute } = getVnDateParts();
    const status = hour < 8 ? 'present' : 'late';
    const photoUrl = `${getBaseUrl(req)}/uploads/${req.file.filename}`;
    const attendanceId = `${employeeId}_${dateKey}`;

    await db.query(
      `INSERT INTO attendance (id, employeeId, date, status, checkin_time, checkin_photo, photo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         checkin_time = VALUES(checkin_time),
         checkin_photo = VALUES(checkin_photo),
         photo_url = VALUES(photo_url)`,
      [attendanceId, employeeId, dateKey, status, dateTime, photoUrl, photoUrl]
    );

    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    res.json({
      success: true,
      photoUrl,
      status,
      date: dateKey,
      checkinTime: dateTime,
      message: hour < 8
        ? `Check-in lúc ${timeStr} — Đúng giờ ✓`
        : `Check-in lúc ${timeStr} — Đi muộn ⚠️`,
    });
  } catch (error) {
    console.error('Error check-in:', error);
    res.status(500).json({ error: error.message });
  }
});

// CHECK-OUT bằng ảnh
app.post('/api/attendance/checkout', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiếu employeeId' });

    const { dateKey, dateTime, hour, minute } = getVnDateParts();
    const finalStatus = hour >= 16 ? 'present' : 'half_day';
    const photoUrl = `${getBaseUrl(req)}/uploads/${req.file.filename}`;
    const attendanceId = `${employeeId}_${dateKey}`;

    await db.query(
      `UPDATE attendance SET
         status = ?, checkout_time = ?, checkout_photo = ?, photo_url = ?
       WHERE id = ? AND employeeId = ? AND date = ?`,
      [finalStatus, dateTime, photoUrl, photoUrl, attendanceId, employeeId, dateKey]
    );

    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    res.json({
      success: true,
      photoUrl,
      status: finalStatus,
      date: dateKey,
      checkoutTime: dateTime,
      message: hour >= 16
        ? `Check-out lúc ${timeStr} — 1 ngày công ✓`
        : `Check-out lúc ${timeStr} — Nửa ngày công ⚠️`,
    });
  } catch (error) {
    console.error('Error check-out:', error);
    res.status(500).json({ error: error.message });
  }
});

// Lấy trạng thái check-in/out của nhân viên theo ngày
app.get('/api/attendance/status/:employeeId/:date', async (req, res) => {
  try {
    const { employeeId, date } = req.params;
    const [rows] = await db.query(
      `SELECT status, checkin_time, checkout_time, checkin_photo, checkout_photo
       FROM attendance WHERE employeeId = ? AND date = ?`,
      [employeeId, date]
    );
    if (rows.length > 0) {
      const row = rows[0];
      const formatTime = (dt) => {
        if (!dt) return null;
        if (typeof dt === 'string') return dt;
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const h = String(dt.getHours()).padStart(2, '0');
        const min = String(dt.getMinutes()).padStart(2, '0');
        const s = String(dt.getSeconds()).padStart(2, '0');
        return `${y}-${m}-${d} ${h}:${min}:${s}`;
      };
      res.json({
        status: row.status,
        checkin_time: formatTime(row.checkin_time),
        checkout_time: formatTime(row.checkout_time),
        checkin_photo: row.checkin_photo,
        checkout_photo: row.checkout_photo,
      });
    } else {
      res.json({ status: null, checkin_time: null, checkout_time: null });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/attendance/history/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const [rows] = await db.query(
      `SELECT date, status, checkin_time, checkout_time, checkin_photo, checkout_photo
       FROM attendance
       WHERE employeeId = ?
       ORDER BY date DESC`,
      [employeeId]
    );
    const formatVN = (dt) => {
      if (!dt) return null;
      if (typeof dt === 'string') return dt;
      const vnDate = new Date(dt.getTime() + 7 * 60 * 60 * 1000);
      return vnDate.toISOString().replace('T', ' ').substring(0, 19);
    };
    res.json(rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
      status: row.status,
      checkin_time: formatVN(row.checkin_time),
      checkout_time: formatVN(row.checkout_time),
      checkin_photo: row.checkin_photo,
      checkout_photo: row.checkout_photo,
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload ảnh chấm công (legacy - giữ lại tương thích)
app.post('/api/attendance/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file ảnh' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiếu employeeId' });

    const { dateKey } = getVnDateParts();
    const photoUrl = `${getBaseUrl(req)}/uploads/${req.file.filename}`;
    const attendanceId = `${employeeId}_${dateKey}`;

    await db.query(
      `INSERT INTO attendance (id, employeeId, date, status, photo_url)
       VALUES (?, ?, ?, 'present', ?)
       ON DUPLICATE KEY UPDATE photo_url = VALUES(photo_url)` ,
      [attendanceId, employeeId, dateKey, photoUrl]
    );
    res.json({ success: true, photoUrl, date: dateKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Khởi chạy server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server API Quynh Anh HR đang chạy tại http://localhost:${PORT}`);
});

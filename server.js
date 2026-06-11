const express = require('express');

const cors = require('cors');

const db = require('./db');
const { getVnDateParts } = require('./vntime');



const app = express();

const PORT = process.env.PORT || 3000;



app.use(cors());

app.use(express.json());



// Auto-migrate: them cac cot can thiet cho cham cong anh va trang thai viec

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
      { name: 'employee_name', def: 'VARCHAR(200) DEFAULT NULL' },

    ];

    for (const col of attendanceToAdd) {

      if (!attendanceColNames.includes(col.name)) {

        await db.query(`ALTER TABLE attendance ADD COLUMN ${col.name} ${col.def}`);

        console.log(` Added column: ${col.name}`);

      }

    }



    const [noteCols] = await db.query(`SHOW COLUMNS FROM work_notes`);

    const noteColNames = noteCols.map(c => c.Field);

    if (!noteColNames.includes('completedByEmployee')) {

      await db.query(`ALTER TABLE work_notes ADD COLUMN completedByEmployee TINYINT(1) NOT NULL DEFAULT 0`);

      console.log('Added column: completedByEmployee');

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



// API Kiem tra ket noi

app.get('/api/health', (req, res) => {

  res.json({ status: 'OK', message: 'Backend Server ket noi MySQL hoat dong binh thuong!' });

});



// ==========================================

// 1. APIs CHO NHAN VIEN (EMPLOYEES)

// ==========================================



// Lay danh sach tat ca nhan vien

app.get('/api/employees', async (req, res) => {

  try {

    const [rows] = await db.query('SELECT * FROM employees');

    // Chuyen doi weeklySchedule tu JSON string thanh object truoc khi gui ve client

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



// Them hoac cap nhat mot nhan vien (INSERT ... ON DUPLICATE KEY UPDATE)

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

    // Dam bao phong ban ton tai truoc khi chen nhan vien de tranh loi khoa ngoai

    await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [emp.department]);



    await db.query(query, values);

    res.json({ success: true, message: 'Luu thong tin nhan vien thanh cong!' });

  } catch (error) {

    console.error('Error saving employee:', error);

    res.status(500).json({ error: error.message });

  }

});



// Xoa nhan vien

app.delete('/api/employees/:id', async (req, res) => {

  const { id } = req.params;

  try {

    await db.query('DELETE FROM employees WHERE id = ?', [id]);

    res.json({ success: true, message: 'Xoa nhan vien thanh cong!' });

  } catch (error) {

    console.error('Error deleting employee:', error);

    res.status(500).json({ error: error.message });

  }

});





// ==========================================

// 2. APIs CHO PHONG BAN (DEPARTMENTS)

// ==========================================



// Lay danh sach tat ca phong ban

app.get('/api/departments', async (req, res) => {

  try {

    const [rows] = await db.query('SELECT name FROM departments');

    res.json(rows.map(r => r.name));

  } catch (error) {

    console.error('Error fetching departments:', error);

    res.status(500).json({ error: error.message });

  }

});



// Them phong ban moi

app.post('/api/departments', async (req, res) => {

  const { name } = req.body;

  if (!name || name.trim() === '') {

    return res.status(400).json({ error: 'Ten phong ban khong duoc trong' });

  }

  try {

    await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name.trim()]);

    res.json({ success: true, message: 'Them phong ban thanh cong!' });

  } catch (error) {

    console.error('Error saving department:', error);

    res.status(500).json({ error: error.message });

  }

});



// Cap nhat ten phong ban

app.put('/api/departments', async (req, res) => {

  const { oldName, newName } = req.body;

  if (!oldName || !newName) {

    return res.status(400).json({ error: 'Thieu ten phong ban cu hoac moi' });

  }



  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();



    // Them phong ban moi nu cha c

    await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [newName]);



    // Cp nht nhn vin thuc phng ban c sang mi

    await connection.query('UPDATE employees SET department = ? WHERE department = ?', [newName, oldName]);



    // Cp nht ghi ch thuc phng ban c sang mi

    await connection.query('UPDATE work_notes SET department = ? WHERE department = ?', [newName, oldName]);



    // Xoa phong ban c (nu khng phi l phng ban mi)

    if (oldName !== newName) {

      await connection.query('DELETE FROM departments WHERE name = ?', [oldName]);

    }



    await connection.commit();

    res.json({ success: true, message: 'Cap nhat phong ban thanh cong!' });

  } catch (error) {

    await connection.rollback();

    console.error('Error updating department:', error);

    res.status(500).json({ error: error.message });

  } finally {

    connection.release();

  }

});



// Xoa phong ban

app.delete('/api/departments/:name', async (req, res) => {

  const { name } = req.params;

  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();



    // Chuyn ton b nhn vin  phng ban ny v phng ban 'Mac dinh'

    await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', ['Mac dinh']);

    await connection.query('UPDATE employees SET department = ? WHERE department = ?', ['Mac dinh', name]);

    await connection.query('UPDATE work_notes SET department = ? WHERE department = ?', ['Mac dinh', name]);



    // Xoa phong ban

    await connection.query('DELETE FROM departments WHERE name = ?', [name]);



    await connection.commit();

    res.json({ success: true, message: 'Xoa phong ban thanh cong!' });

  } catch (error) {

    await connection.rollback();

    console.error('Error deleting department:', error);

    res.status(500).json({ error: error.message });

  } finally {

    connection.release();

  }

});





// ==========================================

// 3. APIs CHO GHI CHU (WORK NOTES)

// ==========================================



// Lay danh sach tat ca ghi chu

app.get('/api/notes', async (req, res) => {

  try {

    const [rows] = await db.query('SELECT * FROM work_notes');

    res.json(rows);

  } catch (error) {

    console.error('Error fetching notes:', error);

    res.status(500).json({ error: error.message });

  }

});



// Them hoac cap nhat mot ghi chu

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

    res.json({ success: true, message: 'Luu ghi chu thanh cong!' });

  } catch (error) {

    console.error('Error saving note:', error);

    res.status(500).json({ error: error.message });

  }

});



// Xoa ghi chu

app.delete('/api/notes/:id', async (req, res) => {

  const { id } = req.params;

  try {

    await db.query('DELETE FROM work_notes WHERE id = ?', [id]);

    res.json({ success: true, message: 'Xoa ghi chu thanh cong!' });

  } catch (error) {

    console.error('Error deleting note:', error);

    res.status(500).json({ error: error.message });

  }

});





// ==========================================

// 4. APIs CHO DIEM DANH (ATTENDANCE)

// ==========================================



// Lay toan bo du lieu diem danh

app.get('/api/attendance', async (req, res) => {

  try {

    const [rows] = await db.query('SELECT employeeId, date, status FROM attendance');

    // Chuyn i sang cu trc Map<Date, Map<EmployeeId, Status>> ging Hive mong i

    // Cu trc: { "2026-05-17": { "emp1": "present", "emp2": "late" } }

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



// Luu thong tin diem danh cho mot ngay cu the

// Body: { "date": "2026-05-17", "attendance": { "emp_id_1": "present", "emp_id_2": "absent" } }

app.post('/api/attendance', async (req, res) => {

  const { date, attendance } = req.body;

  if (!date || !attendance) {

    return res.status(400).json({ error: 'Thieu thong tin ngay hoac danh sach diem danh' });

  }



  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();



    // Lp qua cc cp employeeId -> status  thm/cp nht

    for (const [employeeId, status] of Object.entries(attendance)) {

      const id = `${employeeId}_${date}`; // To ID c bn

      const query = `

        INSERT INTO attendance (id, employeeId, date, status)

        VALUES (?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE status = VALUES(status)

      `;

      await connection.query(query, [id, employeeId, date, status]);

    }



    await connection.commit();

    res.json({ success: true, message: 'Luu diem danh thanh cong!' });

  } catch (error) {

    await connection.rollback();

    console.error('Error saving attendance:', error);

    res.status(500).json({ error: error.message });

  } finally {

    connection.release();

  }

});





// ==========================================

// 5. DON NGHI PHEP (LEAVE REQUESTS)

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

    return res.status(400).json({ error: 'Vui long dien day du thong tin don nghi phep' });

  }

  if (new Date(endDate) < new Date(startDate)) {

    return res.status(400).json({ error: 'Ngay ket thuc phai sau hoac bang ngay bat dau' });

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

        department || 'Mac dinh', leaveType || 'Nghi phep nam',

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

    return res.status(400).json({ error: 'Thieu thong tin duyet don' });

  }

  if (!['approved', 'rejected'].includes(status)) {

    return res.status(400).json({ error: 'Trang thai duyet khong hop le' });

  }



  try {

    const [admins] = await db.query('SELECT role FROM users WHERE email = ?', [adminEmail]);

    if (admins.length === 0 || admins[0].role !== 'admin') {

      return res.status(403).json({ error: 'Chi quan ly moi duoc duyet don' });

    }



    const [existing] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [id]);

    if (existing.length === 0) {

      return res.status(404).json({ error: 'Khong tim thay don nghi phep' });

    }

    if (existing[0].status !== 'pending') {

      return res.status(400).json({ error: 'Don nay da duoc xu ly truoc do' });

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



// Xoa don nghi phep

app.delete('/api/leave-requests/:id', async (req, res) => {

  const { id } = req.params;

  try {

    const [existing] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [id]);

    if (existing.length === 0) {

      return res.status(404).json({ error: 'Khong tim thay don nghi phep' });

    }

    await db.query('DELETE FROM leave_requests WHERE id = ?', [id]);

    res.json({ success: true, message: 'Da xoa don nghi phep' });

  } catch (error) {

    console.error('Error deleting leave request:', error);

    res.status(500).json({ error: error.message });

  }

});



// ==========================================

// 6. DONG BO TOAN BO BACKUP / RESTORE

// ==========================================



// Nhap/Dong bo hoa toan bo du lieu tu Client

app.post('/api/sync/import', async (req, res) => {

  const { employees, departments, notes, attendance } = req.body;

  const connection = await db.getConnection();



  try {

    await connection.beginTransaction();



    // 1. Nhp Departments

    if (departments) {

      for (const deptVal of Object.values(departments)) {

        await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [deptVal]);

      }

    }



    // 2. Nhp Employees

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



    // 3. Nhp Ghi ch (Notes)

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



    // 4. Nhp im danh (Attendance)

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

    res.json({ success: true, message: 'Dong bo hoa du lieu tu Client thanh cong!' });

  } catch (error) {

    await connection.rollback();

    console.error('Error executing import sync:', error);

    res.status(500).json({ error: error.message });

  } finally {

    connection.release();

  }

});



// ==========================================

// 7. APIs HE THONG XAC THUC (AUTHENTICATION)

// ==========================================



// Quan ly tao tai khoan dang nhap cho nhan vien

app.post('/api/auth/register', async (req, res) => {

  const { email, password, fullName, adminEmail, employeeId } = req.body;

  if (!email || !password || !fullName) {

    return res.status(400).json({ error: 'Vui long dien day du thong tin' });

  }

  if (!adminEmail) {

    return res.status(403).json({ error: 'Chi quan ly moi duoc tao tai khoan cho nhan vien' });

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

      return res.status(403).json({ error: 'Ban khong co quyen tao tai khoan' });

    }



    const normalizedEmail = String(email).trim().toLowerCase();

    const [existing] = await connection.query(

      'SELECT email FROM users WHERE email = ?',

      [normalizedEmail]

    );

    if (existing.length > 0) {

      await connection.rollback();

      return res.status(400).json({ error: 'Email da co tai khoan dang nhap' });

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

        return res.status(404).json({ error: 'Khong tim thay ho so nhan vien' });

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

        const deptName = 'Mac dinh';

        await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [deptName]);

        const empId = `emp_${Date.now()}`;

        const empCode = `NV_${Math.floor(Math.random() * 10000)}`;

        await connection.query(

          `INSERT INTO employees

           (id, employeeCode, fullName, gender, email, phone, address, department, position, joinDate, salary, bonus, penalty, notes)

           VALUES (?, ?, ?, 'Nam', ?, '', '', ?, 'Nhan vien', NOW(), 0.0, 0.0, 0.0, '')`,

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



// Dang nhap nguoi dung

app.post('/api/auth/login', async (req, res) => {

  const { email, password } = req.body;

  if (!email || !password) {

    return res.status(400).json({ error: 'Thieu email hoac mat khau' });

  }

  try {

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (rows.length === 0) {

      return res.status(404).json({ error: 'Email chua duoc dang ky trong he thong' });

    }

    const user = rows[0];

    if (user.password !== password) {

      return res.status(400).json({ error: 'Mat khau khong chinh xac' });

    }

    res.json({ success: true, user: { email: user.email, fullName: user.fullName, role: user.role } });

  } catch (error) {

    console.error('Error logging in:', error);

    res.status(500).json({ error: error.message });

  }

});



// Dat lai mat khau

app.post('/api/auth/reset-password', async (req, res) => {

  const { email, newPassword } = req.body;

  if (!email || !newPassword) {

    return res.status(400).json({ error: 'Thieu thong tin dat lai mat khau' });

  }

  try {

    const [existing] = await db.query('SELECT email FROM users WHERE email = ?', [email]);

    if (existing.length === 0) {

      return res.status(404).json({ error: 'Email khong ton tai trong he thong' });

    }

    await db.query('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);

    res.json({ success: true, message: 'Dat lai mat khau thanh cong!' });

  } catch (error) {

    console.error('Error resetting password:', error);

    res.status(500).json({ error: error.message });

  }

});



// Kiem tra email ton tai

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

// UPLOAD NH CHM CNG (Cloudinary)

// ==========================================

const multer = require('multer');

const cloudinary = require('cloudinary').v2;



// Cau hinh Cloudinary

cloudinary.config({

  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ds2gsc7lq',

  api_key: process.env.CLOUDINARY_API_KEY || '482211228592821',

  api_secret: process.env.CLOUDINARY_API_SECRET || 'JpD77duioLiTWdzZbcr9XSIJSsQ',

});



// Multer luu tam vao memory (khong luu disk)

const upload = multer({

  storage: multer.memoryStorage(),

  limits: { fileSize: 5 * 1024 * 1024 },

  fileFilter: (req, file, cb) => {

    if (file.mimetype.startsWith('image/')) cb(null, true);

    else cb(new Error('Chi chap nhan file anh'));

  },

});



// Upload buffer len Cloudinary

function uploadToCloudinary(buffer, folder = 'attendance') {

  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(

      { folder, resource_type: 'image' },

      (error, result) => {

        if (error) reject(error);

        else resolve(result.secure_url);

      }

    );

    stream.end(buffer);

  });

}



// getVnDateParts moved to vntime.js



// CHECK-IN bang anh

app.post('/api/attendance/checkin', upload.single('photo'), async (req, res) => {

  try {

    if (!req.file) return res.status(400).json({ error: 'Khong co file anh' });

    const { employeeId } = req.body;

    if (!employeeId) return res.status(400).json({ error: 'Thieu employeeId' });



    const { dateKey, dateTime, hour, minute } = getVnDateParts();

    const status = hour < 8 ? 'present' : 'late';

    const photoUrl = await uploadToCloudinary(req.file.buffer);

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

        ? `Check-in lc ${timeStr}  ng gi `

        : `Check-in lc ${timeStr}  i mun `,

    });

  } catch (error) {

    console.error('Error check-in:', error);

    res.status(500).json({ error: error.message });

  }

});



// CHECK-OUT bang anh

app.post('/api/attendance/checkout', upload.single('photo'), async (req, res) => {

  try {

    if (!req.file) return res.status(400).json({ error: 'Khong co file anh' });

    const { employeeId } = req.body;

    if (!employeeId) return res.status(400).json({ error: 'Thieu employeeId' });



    const { dateKey, dateTime, hour, minute } = getVnDateParts();

    const finalStatus = hour >= 16 ? 'present' : 'half_day';

    const photoUrl = await uploadToCloudinary(req.file.buffer);

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

        ? `Check-out lc ${timeStr}  1 ngày công `

        : `Check-out lc ${timeStr}  Nửa ngày công `,

    });

  } catch (error) {

    console.error('Error check-out:', error);

    res.status(500).json({ error: error.message });

  }

});



// Ly trng thi check-in/out ca nhn vin theo ngy

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



// Upload nh chm cng (legacy - gi li tng thch)

app.post('/api/attendance/photo', upload.single('photo'), async (req, res) => {

  try {

    if (!req.file) return res.status(400).json({ error: 'Khong co file anh' });

    const { employeeId } = req.body;

    if (!employeeId) return res.status(400).json({ error: 'Thieu employeeId' });



    const { dateKey } = getVnDateParts();

    const photoUrl = await uploadToCloudinary(req.file.buffer);

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



// Khi chy server

app.listen(PORT, '0.0.0.0', () => {

  console.log(`Server API Quynh Anh HR ang chy ti http://localhost:${PORT}`);

});


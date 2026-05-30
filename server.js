﻿const express = require('express');
const cors = require('cors');
const db = require('./db');
const { getVnDateParts } = require('./vntime');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Auto-migrate: thÃªm cÃ¡c cá»™t cáº§n thiáº¿t cho cháº¥m cÃ´ng áº£nh vÃ  tráº¡ng thÃ¡i viá»‡c
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
        console.log(`âœ… Added column: ${col.name}`);
      }
    }

    const [noteCols] = await db.query(`SHOW COLUMNS FROM work_notes`);
    const noteColNames = noteCols.map(c => c.Field);
    if (!noteColNames.includes('completedByEmployee')) {
      await db.query(`ALTER TABLE work_notes ADD COLUMN completedByEmployee TINYINT(1) NOT NULL DEFAULT 0`);
      console.log('âœ… Added column: completedByEmployee');
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

// API Kiá»ƒm tra káº¿t ná»‘i
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend Server káº¿t ná»‘i MySQL hoáº¡t Ä‘á»™ng bÃ¬nh thÆ°á»ng!' });
});

// ==========================================
// 1. APIs CHO NHÃ‚N VIÃŠN (EMPLOYEES)
// ==========================================

// Láº¥y danh sÃ¡ch táº¥t cáº£ nhÃ¢n viÃªn
app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM employees');
    // Chuyá»ƒn Ä‘á»•i weeklySchedule tá»« JSON string thÃ nh object trÆ°á»›c khi gá»­i vá» client
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

// ThÃªm hoáº·c cáº­p nháº­t má»™t nhÃ¢n viÃªn (INSERT ... ON DUPLICATE KEY UPDATE)
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
    // Äáº£m báº£o phÃ²ng ban tá»“n táº¡i trÆ°á»›c khi chÃ¨n nhÃ¢n viÃªn Ä‘á»ƒ trÃ¡nh lá»—i khÃ³a ngoáº¡i
    await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [emp.department]);

    await db.query(query, values);
    res.json({ success: true, message: 'LÆ°u thÃ´ng tin nhÃ¢n viÃªn thÃ nh cÃ´ng!' });
  } catch (error) {
    console.error('Error saving employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// XÃ³a nhÃ¢n viÃªn
app.delete('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM employees WHERE id = ?', [id]);
    res.json({ success: true, message: 'XÃ³a nhÃ¢n viÃªn thÃ nh cÃ´ng!' });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 2. APIs CHO PHÃ’NG BAN (DEPARTMENTS)
// ==========================================

// Láº¥y danh sÃ¡ch táº¥t cáº£ phÃ²ng ban
app.get('/api/departments', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT name FROM departments');
    res.json(rows.map(r => r.name));
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ error: error.message });
  }
});

// ThÃªm phÃ²ng ban má»›i
app.post('/api/departments', async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'TÃªn phÃ²ng ban khÃ´ng Ä‘Æ°á»£c trá»‘ng' });
  }
  try {
    await db.query('INSERT IGNORE INTO departments (name) VALUES (?)', [name.trim()]);
    res.json({ success: true, message: 'ThÃªm phÃ²ng ban thÃ nh cÃ´ng!' });
  } catch (error) {
    console.error('Error saving department:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cáº­p nháº­t tÃªn phÃ²ng ban
app.put('/api/departments', async (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: 'Thiáº¿u tÃªn phÃ²ng ban cÅ© hoáº·c má»›i' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // ThÃªm phÃ²ng ban má»›i náº¿u chÆ°a cÃ³
    await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [newName]);

    // Cáº­p nháº­t nhÃ¢n viÃªn thuá»™c phÃ²ng ban cÅ© sang má»›i
    await connection.query('UPDATE employees SET department = ? WHERE department = ?', [newName, oldName]);

    // Cáº­p nháº­t ghi chÃº thuá»™c phÃ²ng ban cÅ© sang má»›i
    await connection.query('UPDATE work_notes SET department = ? WHERE department = ?', [newName, oldName]);

    // XÃ³a phÃ²ng ban cÅ© (náº¿u khÃ´ng pháº£i lÃ  phÃ²ng ban má»›i)
    if (oldName !== newName) {
      await connection.query('DELETE FROM departments WHERE name = ?', [oldName]);
    }

    await connection.commit();
    res.json({ success: true, message: 'Cáº­p nháº­t phÃ²ng ban thÃ nh cÃ´ng!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating department:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// XÃ³a phÃ²ng ban
app.delete('/api/departments/:name', async (req, res) => {
  const { name } = req.params;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Chuyá»ƒn toÃ n bá»™ nhÃ¢n viÃªn á»Ÿ phÃ²ng ban nÃ y vá» phÃ²ng ban 'Máº·c Ä‘á»‹nh'
    await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', ['Máº·c Ä‘á»‹nh']);
    await connection.query('UPDATE employees SET department = ? WHERE department = ?', ['Máº·c Ä‘á»‹nh', name]);
    await connection.query('UPDATE work_notes SET department = ? WHERE department = ?', ['Máº·c Ä‘á»‹nh', name]);

    // XÃ³a phÃ²ng ban
    await connection.query('DELETE FROM departments WHERE name = ?', [name]);

    await connection.commit();
    res.json({ success: true, message: 'XÃ³a phÃ²ng ban thÃ nh cÃ´ng!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting department:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});


// ==========================================
// 3. APIs CHO GHI CHÃš (WORK NOTES)
// ==========================================

// Láº¥y danh sÃ¡ch táº¥t cáº£ ghi chÃº
app.get('/api/notes', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM work_notes');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res.status(500).json({ error: error.message });
  }
});

// ThÃªm hoáº·c cáº­p nháº­t má»™t ghi chÃº
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
    res.json({ success: true, message: 'LÆ°u ghi chÃº thÃ nh cÃ´ng!' });
  } catch (error) {
    console.error('Error saving note:', error);
    res.status(500).json({ error: error.message });
  }
});

// XÃ³a ghi chÃº
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM work_notes WHERE id = ?', [id]);
    res.json({ success: true, message: 'XÃ³a ghi chÃº thÃ nh cÃ´ng!' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 4. APIs CHO ÄIá»‚M DANH (ATTENDANCE)
// ==========================================

// Láº¥y toÃ n bá»™ dá»¯ liá»‡u Ä‘iá»ƒm danh
app.get('/api/attendance', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT employeeId, date, status FROM attendance');
    // Chuyá»ƒn Ä‘á»•i sang cáº¥u trÃºc Map<Date, Map<EmployeeId, Status>> giá»‘ng Hive mong Ä‘á»£i
    // Cáº¥u trÃºc: { "2026-05-17": { "emp1": "present", "emp2": "late" } }
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

// LÆ°u thÃ´ng tin Ä‘iá»ƒm danh cho má»™t ngÃ y cá»¥ thá»ƒ
// Body: { "date": "2026-05-17", "attendance": { "emp_id_1": "present", "emp_id_2": "absent" } }
app.post('/api/attendance', async (req, res) => {
  const { date, attendance } = req.body;
  if (!date || !attendance) {
    return res.status(400).json({ error: 'Thiáº¿u thÃ´ng tin ngÃ y hoáº·c danh sÃ¡ch Ä‘iá»ƒm danh' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // Láº·p qua cÃ¡c cáº·p employeeId -> status Ä‘á»ƒ thÃªm/cáº­p nháº­t
    for (const [employeeId, status] of Object.entries(attendance)) {
      const id = `${employeeId}_${date}`; // Táº¡o ID Ä‘á»™c báº£n
      const query = `
        INSERT INTO attendance (id, employeeId, date, status)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE status = VALUES(status)
      `;
      await connection.query(query, [id, employeeId, date, status]);
    }

    await connection.commit();
    res.json({ success: true, message: 'LÆ°u Ä‘iá»ƒm danh thÃ nh cÃ´ng!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error saving attendance:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});


// ==========================================
// 5. ÄÆ N NGHá»ˆ PHÃ‰P (LEAVE REQUESTS)
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
    return res.status(400).json({ error: 'Vui lÃ²ng Ä‘iá»n Ä‘áº§y Ä‘á»§ thÃ´ng tin Ä‘Æ¡n nghá»‰ phÃ©p' });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return res.status(400).json({ error: 'NgÃ y káº¿t thÃºc pháº£i sau hoáº·c báº±ng ngÃ y báº¯t Ä‘áº§u' });
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
        department || 'Máº·c Ä‘á»‹nh', leaveType || 'Nghá»‰ phÃ©p nÄƒm',
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
    return res.status(400).json({ error: 'Thiáº¿u thÃ´ng tin duyá»‡t Ä‘Æ¡n' });
  }
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Tráº¡ng thÃ¡i duyá»‡t khÃ´ng há»£p lá»‡' });
  }

  try {
    const [admins] = await db.query('SELECT role FROM users WHERE email = ?', [adminEmail]);
    if (admins.length === 0 || admins[0].role !== 'admin') {
      return res.status(403).json({ error: 'Chá»‰ quáº£n lÃ½ má»›i Ä‘Æ°á»£c duyá»‡t Ä‘Æ¡n' });
    }

    const [existing] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n nghá»‰ phÃ©p' });
    }
    if (existing[0].status !== 'pending') {
      return res.status(400).json({ error: 'ÄÆ¡n nÃ y Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½ trÆ°á»›c Ä‘Ã³' });
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

// XÃ³a Ä‘Æ¡n nghá»‰ phÃ©p (admin hoáº·c nhÃ¢n viÃªn xÃ³a Ä‘Æ¡n pending cá»§a mÃ¬nh)
app.delete('/api/leave-requests/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [existing] = await db.query('SELECT * FROM leave_requests WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n nghá»‰ phÃ©p' });
    }
    await db.query('DELETE FROM leave_requests WHERE id = ?', [id]);
    res.json({ success: true, message: 'ÄÃ£ xÃ³a Ä‘Æ¡n nghá»‰ phÃ©p' });
  } catch (error) {
    console.error('Error deleting leave request:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 6. Äá»’NG Bá»˜ TOÃ€N Bá»˜ BACKUP / RESTORE
// ==========================================

// Nháº­p/Äá»“ng bá»™ hÃ³a toÃ n bá»™ dá»¯ liá»‡u tá»« Client (Khi khá»Ÿi Ä‘á»™ng app láº§n Ä‘áº§u hoáº·c nháº¥n Äá»“ng bá»™)
app.post('/api/sync/import', async (req, res) => {
  const { employees, departments, notes, attendance } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Nháº­p Departments
    if (departments) {
      for (const deptVal of Object.values(departments)) {
        await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [deptVal]);
      }
    }

    // 2. Nháº­p Employees
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

    // 3. Nháº­p Ghi chÃº (Notes)
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

    // 4. Nháº­p Äiá»ƒm danh (Attendance)
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
    res.json({ success: true, message: 'Äá»“ng bá»™ hÃ³a dá»¯ liá»‡u tá»« Client thÃ nh cÃ´ng!' });
  } catch (error) {
    await connection.rollback();
    console.error('Error executing import sync:', error);
    res.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// ==========================================
// 6. APIs Há»† THá»NG XÃC THá»°C (AUTHENTICATION)
// ==========================================

// Quáº£n lÃ½ táº¡o tÃ i khoáº£n Ä‘Äƒng nháº­p cho nhÃ¢n viÃªn (nhÃ¢n viÃªn khÃ´ng tá»± Ä‘Äƒng kÃ½)
app.post('/api/auth/register', async (req, res) => {
  const { email, password, fullName, adminEmail, employeeId } = req.body;
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Vui lÃ²ng Ä‘iá»n Ä‘áº§y Ä‘á»§ thÃ´ng tin' });
  }
  if (!adminEmail) {
    return res.status(403).json({ error: 'Chá»‰ quáº£n lÃ½ má»›i Ä‘Æ°á»£c táº¡o tÃ i khoáº£n cho nhÃ¢n viÃªn' });
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
      return res.status(403).json({ error: 'Báº¡n khÃ´ng cÃ³ quyá»n táº¡o tÃ i khoáº£n' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await connection.query(
      'SELECT email FROM users WHERE email = ?',
      [normalizedEmail]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Email Ä‘Ã£ cÃ³ tÃ i khoáº£n Ä‘Äƒng nháº­p' });
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
        return res.status(404).json({ error: 'KhÃ´ng tÃ¬m tháº¥y há»“ sÆ¡ nhÃ¢n viÃªn' });
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
        const deptName = 'Máº·c Ä‘á»‹nh';
        await connection.query('INSERT IGNORE INTO departments (name) VALUES (?)', [deptName]);
        const empId = `emp_${Date.now()}`;
        const empCode = `NV_${Math.floor(Math.random() * 10000)}`;
        await connection.query(
          `INSERT INTO employees
           (id, employeeCode, fullName, gender, email, phone, address, department, position, joinDate, salary, bonus, penalty, notes)
           VALUES (?, ?, ?, 'Nam', ?, '', '', ?, 'NhÃ¢n viÃªn', NOW(), 0.0, 0.0, 0.0, '')`,
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

// ÄÄƒng nháº­p ngÆ°á»i dÃ¹ng
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Thiáº¿u email hoáº·c máº­t kháº©u' });
  }
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email chÆ°a Ä‘Æ°á»£c Ä‘Äƒng kÃ½ trong há»‡ thá»‘ng' });
    }
    const user = rows[0];
    if (user.password !== password) {
      return res.status(400).json({ error: 'Máº­t kháº©u khÃ´ng chÃ­nh xÃ¡c' });
    }
    res.json({ success: true, user: { email: user.email, fullName: user.fullName, role: user.role } });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message });
  }
});

// Äáº·t láº¡i máº­t kháº©u
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Thiáº¿u thÃ´ng tin Ä‘áº·t láº¡i máº­t kháº©u' });
  }
  try {
    const [existing] = await db.query('SELECT email FROM users WHERE email = ?', [email]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Email khÃ´ng tá»“n táº¡i trong há»‡ thá»‘ng' });
    }
    await db.query('UPDATE users SET password = ? WHERE email = ?', [newPassword, email]);
    res.json({ success: true, message: 'Äáº·t láº¡i máº­t kháº©u thÃ nh cÃ´ng!' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kiá»ƒm tra email tá»“n táº¡i
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
// UPLOAD áº¢NH CHáº¤M CÃ”NG (Cloudinary)
// ==========================================
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Cáº¥u hÃ¬nh Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'ds2gsc7lq',
  api_key: process.env.CLOUDINARY_API_KEY || '482211228592821',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'JpD77duioLiTWdzZbcr9XSIJSsQ',
});

// Multer lÆ°u táº¡m vÃ o memory (khÃ´ng lÆ°u disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Chá»‰ cháº¥p nháº­n file áº£nh'));
  },
});

// Upload buffer lÃªn Cloudinary
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

// CHECK-IN báº±ng áº£nh
app.post('/api/attendance/checkin', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'KhÃ´ng cÃ³ file áº£nh' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiáº¿u employeeId' });

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
        ? `Check-in lÃºc ${timeStr} â€” ÄÃºng giá» âœ“`
        : `Check-in lÃºc ${timeStr} â€” Äi muá»™n âš ï¸`,
    });
  } catch (error) {
    console.error('Error check-in:', error);
    res.status(500).json({ error: error.message });
  }
});

// CHECK-OUT báº±ng áº£nh
app.post('/api/attendance/checkout', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'KhÃ´ng cÃ³ file áº£nh' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiáº¿u employeeId' });

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
        ? `Check-out lÃºc ${timeStr} â€” 1 ngÃ y cÃ´ng âœ“`
        : `Check-out lÃºc ${timeStr} â€” Ná»­a ngÃ y cÃ´ng âš ï¸`,
    });
  } catch (error) {
    console.error('Error check-out:', error);
    res.status(500).json({ error: error.message });
  }
});

// Láº¥y tráº¡ng thÃ¡i check-in/out cá»§a nhÃ¢n viÃªn theo ngÃ y
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

// Upload áº£nh cháº¥m cÃ´ng (legacy - giá»¯ láº¡i tÆ°Æ¡ng thÃ­ch)
app.post('/api/attendance/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'KhÃ´ng cÃ³ file áº£nh' });
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Thiáº¿u employeeId' });

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

// Khá»Ÿi cháº¡y server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server API Quynh Anh HR Ä‘ang cháº¡y táº¡i http://localhost:${PORT}`);
});

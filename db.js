const mysql = require('mysql2/promise');

// Cấu hình kết nối MySQL (Có thể cấu hình qua biến môi trường hoặc dùng giá trị mặc định)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456', // Mật khẩu của MySQL trên máy bạn (để trống hoặc thay bằng mật khẩu của bạn)
  database: process.env.DB_NAME || 'quanlynhansu',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;

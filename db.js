const mysql = require('mysql2/promise');

let pool;

if (process.env.MYSQL_URL) {
  // Railway: dùng MYSQL_URL connection string
  pool = mysql.createPool(process.env.MYSQL_URL);
} else {
  // Local: dùng các biến riêng lẻ hoặc giá trị mặc định
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'quanlynhansu',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

module.exports = pool;

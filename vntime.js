// Helper: Get Vietnam time parts (UTC+7)
function getVnDateParts(date) {
  const now = date || new Date();
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = vn.getUTCFullYear();
  const month = String(vn.getUTCMonth() + 1).padStart(2, '0');
  const day = String(vn.getUTCDate()).padStart(2, '0');
  const hour = vn.getUTCHours();
  const minute = vn.getUTCMinutes();
  const second = String(vn.getUTCSeconds()).padStart(2, '0');
  return {
    dateKey: `${year}-${month}-${day}`,
    dateTime: `${year}-${month}-${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${second}`,
    hour: hour,
    minute: minute,
  };
}

module.exports = { getVnDateParts };

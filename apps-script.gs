// วางโค้ดนี้ใน Google Sheets > ส่วนขยาย > Apps Script แล้ว Deploy เป็น Web app (ดูขั้นตอนใน README.md)
const COLUMNS = ["sentAt", "session", "type", "audience", "picks", "specialty", "specialtyName", "seconds"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(COLUMNS);
    const data = JSON.parse(e.postData.contents);
    // ใส่ ' นำหน้าข้อความที่อาจถูกตีความเป็นสูตรในชีต
    sheet.appendRow(COLUMNS.map(key => {
      const value = String(data[key] === undefined ? "" : data[key]).slice(0, 200);
      return /^[=+\-@]/.test(value) ? "'" + value : value;
    }));
    return ContentService.createTextOutput("ok");
  } finally {
    lock.releaseLock();
  }
}

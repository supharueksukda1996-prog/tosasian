// วางโค้ดนี้ใน Google Sheets > ส่วนขยาย > Apps Script แล้ว Deploy เป็น Web app (ดูขั้นตอนใน README.md)
// ข้อมูลแยกเป็น 2 แท็บ: "แบบสอบถาม" หนึ่งแถวต่อผู้เล่น และ "ผลเกม" หนึ่งแถวต่อการเล่นหนึ่งรอบ จับคู่กันด้วยคอลัมน์ session
// คอลัมน์สร้างให้อัตโนมัติตามคำถามใน data.js ถ้าเพิ่มคำถามใหม่ คอลัมน์ใหม่จะต่อท้ายให้เอง
const TABS = { survey: "แบบสอบถาม", result: "ผลเกม" };

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const data = JSON.parse(e.postData.contents);
    const name = TABS[data.type];
    if (!name) return ContentService.createTextOutput("skip");
    const book = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    delete data.type;
    // หัวตาราง: ใช้ของเดิม แล้วเพิ่มคอลัมน์ที่ยังไม่มี
    let header = sheet.getLastRow() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
    const missing = Object.keys(data).filter(k => !header.includes(k));
    if (missing.length) {
      header = header.concat(missing);
      sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    // ใส่ ' นำหน้าข้อความที่อาจถูกตีความเป็นสูตรในชีต
    const row = header.map(key => {
      const value = String(data[key] === undefined ? "" : data[key]).slice(0, 300);
      return /^[=+\-@]/.test(value) ? "'" + value : value;
    });
    sheet.appendRow(row);
    return ContentService.createTextOutput("ok");
  } finally {
    lock.releaseLock();
  }
}

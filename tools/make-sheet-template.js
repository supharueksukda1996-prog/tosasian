// สร้างไฟล์ CSV จากค่าใน data.js ไว้นำเข้า Google Sheets เป็นชีตตั้งค่าเริ่มต้น
// ใช้งาน: node tools/make-sheet-template.js
const fs = require("fs");
const path = require("path");
global.GAME = require("../data.js");
const ENGINE = require("../engine.js");

const out = path.join(__dirname, "..", "sheet-template");
fs.mkdirSync(out, { recursive: true });
const cell = v => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const write = (name, rows) => {
  // ใส่ BOM เพื่อให้ Excel และ Google Sheets อ่านภาษาไทยถูก
  fs.writeFileSync(path.join(out, name), "﻿" + rows.map(r => r.map(cell).join(",")).join("\n") + "\n", "utf8");
};
const dims = ENGINE.dims();

write("settings.csv", [["key", "value", "หมายเหตุ"],
  ...Object.entries(GAME.settings).map(([k, v]) => [k, v, k === "rareRate" ? "โอกาสได้การ์ด Rare 0 ถึง 1" : ""])]);

write("specialties.csv", [["id", "name", "guild", ...dims, "bias", "item", "trait", "fortune", "ask", "img", "hero", "heroRare"],
  ...GAME.specialties.map(s => [s.id, s.name, s.guild, ...dims.map(d => s.profile[d]), s.bias, s.item, s.trait, s.fortune, s.ask, s.img, s.hero, s.heroRare])]);

write("questions.csv", [["q", "ask", "option", "text", ...dims],
  ...ENGINE.questions().flatMap(q => q.options.map((o, i) => [q.id, i === 0 ? q.ask : "", "ABC"[i], o.text, ...dims.map(d => (o.score && o.score[d]) || "")]))]);

write("dimensions.csv", [["id", "name", "desc"], ...GAME.dimensions.map(d => [d.id, d.name, d.desc])]);
console.log("wrote", fs.readdirSync(out).join(", "));

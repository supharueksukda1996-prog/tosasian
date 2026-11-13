// ระบบคิดคะแนนบุคลิกและโหลดค่าจากชีต ใช้ร่วมกันทั้งเกมและหน้าตรวจค่า
const ENGINE = (() => {
  const dims = () => GAME.dimensions.map(d => d.id);
  const questions = () => GAME.chapters.flatMap(c => c.questions || []);

  // คะแนนสูงสุดที่แต่ละมิติเป็นไปได้ ใช้แปลงคะแนนดิบเป็น 0..1
  function maxPerDim() {
    const max = Object.fromEntries(dims().map(d => [d, 0]));
    for (const q of questions()) for (const d of dims()) max[d] += Math.max(0, ...q.options.map(o => (o.score && o.score[d]) || 0));
    return max;
  }

  // picks คือหมายเลขตัวเลือกของแต่ละข้อ เรียงตามลำดับคำถาม
  function profileOf(picks) {
    const raw = Object.fromEntries(dims().map(d => [d, 0]));
    questions().forEach((q, i) => {
      const o = q.options[picks[i]];
      if (o && o.score) for (const d in o.score) if (d in raw) raw[d] += o.score[d];
    });
    const max = maxPerDim();
    return Object.fromEntries(dims().map(d => [d, max[d] ? raw[d] / max[d] : 0]));
  }

  // เทียบรูปทรงของบุคลิก ไม่ใช่ความสูงของคะแนน จึงลบค่าเฉลี่ยออกก่อนแล้วใช้ cosine
  function centered(vec) {
    const v = dims().map(d => vec[d] || 0), mean = v.reduce((a, b) => a + b, 0) / v.length;
    return v.map(x => x - mean);
  }
  function similarity(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }

  function rank(profile) {
    const p = centered(profile);
    return GAME.specialties
      .map(s => ({ s, score: similarity(p, centered(s.profile)) + (Number(s.bias) || 0) }))
      .sort((a, b) => b.score - a.score);
  }

  // ค่าสถานะบนการ์ด ด้านที่เด่นที่สุดของผู้เล่นได้ 99
  function stats(profile) {
    const top = Math.max(...dims().map(d => profile[d]), .001);
    return GAME.dimensions.map(d => ({ ...d, value: Math.round(30 + 69 * (profile[d.id] / top)) }));
  }

  // ---------- ชีตตั้งค่า ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const [head, ...body] = rows.filter(r => r.some(c => c.trim() !== ""));
    return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || "").trim()])));
  }

  async function fetchCSV(url, timeout) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      return parseCSV(await res.text());
    } finally { clearTimeout(timer); }
  }

  const num = (v, fallback) => (v === "" || v === undefined || isNaN(Number(v)) ? fallback : Number(v));

  // อ่านค่าจากชีตมาทับค่าเริ่มต้นใน data.js ถ้าโหลดไม่ได้ เกมจะใช้ค่าเดิมต่อ
  async function loadSheet(timeout = 3500) {
    const urls = GAME.sheet || {};
    const report = { loaded: [], failed: [] };
    const tasks = Object.entries(urls).filter(([, url]) => url).map(async ([tab, url]) => {
      try { applyTab(tab, await fetchCSV(url, timeout)); report.loaded.push(tab); }
      catch (e) { report.failed.push(tab); }
    });
    await Promise.all(tasks);
    return report;
  }

  function applyTab(tab, rows) {
    if (tab === "settings") {
      for (const r of rows) {
        if (!r.key) continue;
        const cur = GAME.settings[r.key];
        GAME.settings[r.key] = typeof cur === "number" ? num(r.value, cur) : r.value;
      }
    }
    if (tab === "specialties") {
      for (const r of rows) {
        const s = GAME.specialties.find(x => x.id === r.id);
        if (!s) continue;
        for (const key of ["name", "guild", "item", "trait", "fortune", "ask", "skill", "img", "hero", "heroRare"]) if (r[key]) s[key] = r[key];
        for (const d of dims()) s.profile[d] = num(r[d], s.profile[d]);
        s.bias = num(r.bias, s.bias);
      }
    }
    if (tab === "questions") {
      const list = questions();
      for (const r of rows) {
        const q = list.find(x => x.id === r.q);
        if (!q) continue;
        if (r.ask) q.ask = r.ask;
        const o = q.options["ABC".indexOf((r.option || "").toUpperCase())];
        if (!o) continue;
        if (r.text) o.text = r.text;
        if (r.reply) o.reply = r.reply;
        o.score = {};
        for (const d of dims()) { const v = num(r[d], 0); if (v) o.score[d] = v; }
      }
    }
  }

  return { dims, questions, maxPerDim, profileOf, rank, stats, loadSheet, parseCSV };
})();

if (typeof module !== "undefined") module.exports = ENGINE;

(() => {
  const stage = document.getElementById("stage");
  const pack = document.getElementById("pack");
  const dim = document.getElementById("dim");
  const flash = document.getElementById("flash");
  const QUEUE_KEY = "aurelen-queue";

  const state = { nick: "", audience: "", picks: [], startedAt: 0, session: "", result: null, rare: false, profile: null };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const S = () => GAME.settings;
  const dimName = id => (GAME.dimensions.find(d => d.id === id) || {}).name || id;

  // ---------- หน้าแรก ----------
  function showIntro() {
    pack.hidden = true;
    dim.classList.remove("on");
    stage.innerHTML = `
      <section class="intro">
        <header class="hero">
          <small>จบแล้วไปไหน · คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น</small>
          <h1>${esc(S().title)}</h1>
          <p>${esc(S().subtitle)}</p>
          <p class="hero-sub">ตอบ ${ENGINE.questions().length} คำถามระหว่างการเดินทาง<br>แล้วรับการ์ดผู้เยียวยาที่เป็นตัวคุณ</p>
        </header>
        <form class="sheet" id="intro">
          <label class="field">ชื่อบนการ์ด <small>(ไม่บังคับ)</small>
            <input id="nick" maxlength="20" autocomplete="off" placeholder="ชื่อเล่นของคุณ">
          </label>
          ${GAME.endpoint ? `<label class="field">คุณอยู่ชั้นปีไหน
            <select id="aud" required>
              <option value="">เลือกชั้นปี</option>
              ${GAME.audience.map(a => `<option>${esc(a)}</option>`).join("")}
            </select>
          </label>` : ""}
          <button class="btn" type="submit">เข้าร่วมกองทัพ</button>
          ${GAME.endpoint ? `<p class="notice">ผู้จัดงานเก็บชั้นปี คำตอบ และผลลัพธ์แบบไม่ระบุตัวตน เพื่อใช้ปรับปรุงกิจกรรม ชื่อบนการ์ดจะไม่ถูกส่งออกจากเครื่อง การกดเริ่มถือว่ายินยอมตามนี้</p>` : ""}
        </form>
      </section>`;
    document.getElementById("intro").addEventListener("submit", e => {
      e.preventDefault();
      state.nick = document.getElementById("nick").value.trim();
      state.audience = GAME.endpoint ? document.getElementById("aud").value : "";
      state.picks = [];
      state.startedAt = Date.now();
      state.session = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      pack.hidden = false;
      renderProgress();
      playChapter(0, true);
    });
  }

  function renderProgress() {
    const total = ENGINE.questions().length, done = state.picks.length;
    pack.innerHTML = `<div class="progress" aria-label="ตอบแล้ว ${done} จาก ${total} ข้อ"><span style="width:${(done / total) * 100}%"></span></div><b>${done}/${total}</b>`;
  }

  // ---------- เล่าเรื่องทีละจังหวะ ----------
  function shell(chapter, inner) {
    stage.innerHTML = `<section class="scene-ui ${chapter.dark ? "dark" : ""}"><div class="place">${esc(chapter.place)}</div>${inner}</section>`;
  }

  function lineHTML(who, text) {
    return `${who ? `<span class="who">${esc(who)}</span>` : ""}<span class="line">${esc(text)}</span>`;
  }

  // กล่องข้อความพร้อมรูปผู้พูดด้านข้าง จะขยับเข้ามาเฉพาะตอนเปลี่ยนผู้พูด
  let lastSpeaker = "";
  function talkHTML(who, inner) {
    const face = GAME.speakers[who];
    const html = face ? `<div class="face ${who === lastSpeaker ? "" : "enter"}"><img src="${esc(face)}" alt="${esc(who)}"></div>` : "";
    lastSpeaker = who || "";
    return `<div class="talk">${html}${inner}</div>`;
  }

  async function playChapter(i, first) {
    const chapter = GAME.chapters[i];
    stage.innerHTML = "";
    if (!first || chapter.scene !== 0) await Scenes.go(chapter.scene);
    if (chapter.quake) { await wait(500); Scenes.shake(); }
    await playBeats(chapter, chapter.beats);
    for (const q of chapter.questions || []) await askQuestion(chapter, q);
    if (chapter.after) await playBeats(chapter, chapter.after);
    if (i === GAME.chapters.length - 1) showFinal(chapter);
    else playChapter(i + 1);
  }

  function playBeats(chapter, beats) {
    return new Promise(resolve => {
      let n = 0;
      const render = () => {
        const [who, text] = beats[n];
        shell(chapter, talkHTML(who, `<button class="dialog" type="button" id="beat">${lineHTML(who, text)}<span class="more">แตะเพื่ออ่านต่อ</span></button>`));
        document.getElementById("beat").addEventListener("click", () => {
          n++;
          if (n < beats.length) render();
          else resolve();
        });
      };
      render();
    });
  }

  function askQuestion(chapter, q) {
    lastSpeaker = "";
    return new Promise(resolve => {
      shell(chapter, `
        <div class="dialog static">
          <span class="ask">${esc(q.ask)}</span>
          <div class="options">
            ${q.options.map((o, n) => `<button class="option" type="button" data-n="${n}">${esc(o.text)}</button>`).join("")}
          </div>
        </div>`);
      stage.querySelectorAll(".option").forEach(btn => btn.addEventListener("click", async () => {
        const n = Number(btn.dataset.n), o = q.options[n];
        stage.querySelectorAll(".option").forEach(b => (b.disabled = true));
        btn.classList.add("picked");
        state.picks.push(n);
        renderProgress();
        // บอกผู้เล่นว่าคำตอบนี้เพิ่มค่าสถานะด้านไหน
        const gains = Object.entries(o.score || {}).filter(([, v]) => v > 0).map(([d, v]) => `<span>+${v} ${esc(dimName(d))}</span>`).join("");
        if (gains) btn.insertAdjacentHTML("beforeend", `<span class="gain">${gains}</span>`);
        await wait(gains ? 650 : 200);
        resolve();
      }));
    });
  }

  function showFinal(chapter) {
    // ซ่อนกล่องข้อความ ให้เห็นผู้เยียวยาชูแสงต่อหน้าราชาอสูร
    shell(chapter, `<button class="btn gold" type="button" id="go">${esc(chapter.next)}</button>`);
    document.getElementById("go").addEventListener("click", reveal);
  }

  // ---------- คิดผล ----------
  function randomUnit() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32;
  }

  async function reveal() {
    state.profile = ENGINE.profileOf(state.picks);
    const ranking = ENGINE.rank(state.profile);
    state.result = ranking[0].s;
    state.runnerUp = ranking[1].s;
    state.rare = randomUnit() < Number(S().rareRate);
    const art = cardArt();
    stage.innerHTML = "";
    pack.hidden = true;
    await Promise.race([Promise.all([loadImage(art), state.result.img ? loadImage(state.result.img) : null]), wait(2500)]);
    Scenes.shake();
    flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
    send({
      type: "result",
      audience: state.audience,
      picks: state.picks.map(n => "ABC"[n]).join(""),
      specialty: state.result.id,
      specialtyName: state.result.name,
      rare: state.rare ? 1 : 0,
      seconds: Math.round((Date.now() - state.startedAt) / 1000),
    });
    await wait(450);
    dim.classList.add("on");
    showResult();
  }

  const cardArt = () => (state.rare && state.result.heroRare) || state.result.hero;

  function cardHTML() {
    const s = state.result, rare = state.rare;
    const stats = ENGINE.stats(state.profile);
    return `
      <article class="tcg ${rare ? "rare" : "common"}">
        <div class="tcg-inner">
          <header class="tcg-top">
            <span class="tcg-name">${esc(s.guild)}</span>
            <span class="tcg-gem">${rare ? "★ RARE" : "◆ COMMON"}</span>
          </header>
          <div class="tcg-art">
            <img src="${esc(cardArt())}" alt="ตัวแทนสาขา ${esc(s.name)}">
            ${s.img ? `<img class="tcg-badge" src="${esc(s.img)}" alt="">` : ""}
          </div>
          <div class="tcg-type"><span>${esc(s.name)}</span><span>No.${String(s.no).padStart(2, "0")}/${GAME.specialties.length}</span></div>
          <div class="tcg-stats">
            ${stats.map(d => `<div class="stat"><span>${esc(d.name)}</span><i><b style="width:${d.value}%"></b></i><em>${d.value}</em></div>`).join("")}
          </div>
          <div class="tcg-skill"><b>สกิล · ${esc(s.item)}</b>${esc(s.fortune)}</div>
          ${state.nick ? `<div class="tcg-owner">ผู้เยียวยา ${esc(state.nick)}</div>` : ""}
        </div>
      </article>`;
  }

  function showResult() {
    const s = state.result;
    stage.innerHTML = `
      <section class="result">
        <p class="result-kicker">${state.rare ? "โชคเข้าข้าง! คุณได้การ์ด Rare" : "การ์ดผู้เยียวยาของคุณ"}</p>
        ${cardHTML()}
        <div class="panel">
          <p class="trait"><b>บุคลิก</b>${esc(s.trait)}</p>
          <p class="trait"><b>ใกล้เคียงรองลงมา</b>${esc(state.runnerUp.name)} · ${esc(state.runnerUp.guild)}</p>
          <div class="divider"></div>
          <p class="mission">ไปคุยกับอาจารย์ที่ซุ้ม ${esc(s.name)} เพื่อรับภารกิจต่อ</p>
          <div class="ask-teacher"><b>คำถามชวนคุยกับอาจารย์</b>${esc(s.ask)}</div>
          <p class="disclaimer">ออกแบบจากแนวคิดงานวิจัยด้านความสนใจอาชีพและการเลือกสาขา เพื่อความสนุก ไม่ใช่การวัดทางวิชาการ</p>
        </div>
        <div class="actions">
          <button class="btn" type="button" id="save">แชร์ลงสตอรี่</button>
          <button class="btn ghost light" type="button" id="again">เล่นอีกครั้ง</button>
        </div>
      </section>`;
    scrollTo(0, 0);
    document.getElementById("save").addEventListener("click", makeStory);
    document.getElementById("again").addEventListener("click", async () => {
      stage.innerHTML = "";
      dim.classList.remove("on");
      await Scenes.go(0);
      showIntro();
    });
  }

  // ---------- การ์ดสตอรี่ ----------
  function wrap(ctx, text, maxWidth) {
    // ใช้ตัวตัดคำภาษาไทยของเบราว์เซอร์ถ้ามี
    const seg = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("th", { granularity: "word" }) : null;
    const parts = seg ? [...seg.segment(text)].map(s => s.segment) : text.split(/(\s+)/);
    const lines = [];
    let line = "";
    for (const part of parts) {
      if (ctx.measureText(line + part).width > maxWidth && line) { lines.push(line.trim()); line = part; }
      else line += part;
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
  }
  function loadImage(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  function rounded(x, X, Y, W, H, R) {
    x.beginPath();
    x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R);
    x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath();
  }
  function cover(x, img, X, Y, W, H) {
    const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r;
    x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
    x.drawImage(img, X + (W - w) / 2, Y, w, h);
    x.restore();
  }

  async function makeStory() {
    const s = state.result, rare = state.rare;
    const font = (weight, size, family = "Sarabun") => `${weight} ${size}px ${family}, "Noto Sans Thai", sans-serif`;
    try { await Promise.all([document.fonts.load("700 80px Charmonman", S().title), document.fonts.load("700 40px Sarabun", "สำนัก"), document.fonts.load("500 40px Sarabun", "สำนัก")]); } catch (e) { /* ใช้ฟอนต์สำรอง */ }
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1920;
    const x = c.getContext("2d");
    const [art, badge] = await Promise.all([loadImage(cardArt()), loadImage(s.img)]);

    // พื้นหลังเบลอจากภาพตัวละคร
    x.fillStyle = "#120f18"; x.fillRect(0, 0, 1080, 1920);
    if (art) { x.save(); x.filter = "blur(40px) brightness(.45)"; cover(x, art, -60, -60, 1200, 2040); x.restore(); }
    x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = "rgba(0,0,0,.85)"; x.shadowBlur = 18;
    x.fillStyle = "#fff4d6"; x.font = font(700, 58, "Charmonman"); x.fillText(S().title, 540, 236);
    x.font = font(600, 30); x.fillText(state.nick ? `การ์ดผู้เยียวยาของ ${state.nick}` : "การ์ดผู้เยียวยาของฉัน", 540, 300);
    x.shadowBlur = 0;

    // กรอบการ์ด
    const X = 110, Y = 350, W = 860, H = 1250;
    const frame = x.createLinearGradient(X, Y, X + W, Y + H);
    if (rare) { frame.addColorStop(0, "#fff0b5"); frame.addColorStop(.35, "#d9a441"); frame.addColorStop(.6, "#fff7d8"); frame.addColorStop(1, "#b07a1f"); }
    else { frame.addColorStop(0, "#9fd0b4"); frame.addColorStop(.5, "#59836a"); frame.addColorStop(1, "#2f5a44"); }
    x.shadowColor = rare ? "rgba(255,210,110,.7)" : "rgba(0,0,0,.6)"; x.shadowBlur = rare ? 60 : 30;
    x.fillStyle = frame; rounded(x, X, Y, W, H, 34); x.fill();
    x.shadowBlur = 0;
    x.fillStyle = "#fbf4e2"; rounded(x, X + 18, Y + 18, W - 36, H - 36, 22); x.fill();

    // แถบชื่อ
    x.fillStyle = rare ? "#3a2a0f" : "#24352b"; rounded(x, X + 34, Y + 34, W - 68, 76, 16); x.fill();
    x.textAlign = "left"; x.fillStyle = "#fff7e2"; x.font = font(700, 38); x.fillText(s.guild, X + 58, Y + 73);
    x.textAlign = "right"; x.fillStyle = rare ? "#ffd46b" : "#a9e0c0"; x.font = font(700, 26); x.fillText(rare ? "★ RARE" : "◆ COMMON", X + W - 58, Y + 73);

    // ภาพ
    const AX = X + 34, AY = Y + 124, AW = W - 68, AH = 600;
    x.save(); rounded(x, AX, AY, AW, AH, 14); x.clip();
    if (art) cover(x, art, AX, AY, AW, AH);
    if (rare) {
      // ฟอยล์รุ้งพาดเฉียง
      const foil = x.createLinearGradient(AX, AY, AX + AW, AY + AH);
      ["rgba(255,90,170,.0)", "rgba(255,120,200,.28)", "rgba(120,200,255,.28)", "rgba(140,255,200,.25)", "rgba(255,240,140,.28)", "rgba(255,90,170,0)"].forEach((col, i, a) => foil.addColorStop(i / (a.length - 1), col));
      x.globalCompositeOperation = "overlay"; x.fillStyle = foil; x.fillRect(AX, AY, AW, AH); x.globalCompositeOperation = "source-over";
    }
    x.restore();
    x.strokeStyle = rare ? "#d9a441" : "#59836a"; x.lineWidth = 5; rounded(x, AX, AY, AW, AH, 14); x.stroke();
    if (badge) {
      x.fillStyle = "#fffaf0"; x.beginPath(); x.arc(AX + AW - 70, AY + AH - 64, 62, 0, 7); x.fill();
      x.strokeStyle = rare ? "#d9a441" : "#59836a"; x.lineWidth = 5; x.stroke();
      x.drawImage(badge, AX + AW - 116, AY + AH - 110, 92, 92);
    }

    // ชนิดการ์ด
    let y = AY + AH + 44;
    x.textAlign = "left"; x.fillStyle = "#2f2a24"; x.font = font(700, 44); x.fillText(s.name, X + 40, y);
    x.textAlign = "right"; x.fillStyle = "#8a7d66"; x.font = font(600, 26); x.fillText(`No.${String(s.no).padStart(2, "0")}/${GAME.specialties.length}`, X + W - 40, y);

    // ค่าสถานะ 2 คอลัมน์
    const stats = ENGINE.stats(state.profile);
    y += 48;
    stats.forEach((d, i) => {
      const col = i % 2, row = Math.floor(i / 2), sx = X + 40 + col * 400, sy = y + row * 50;
      x.textAlign = "left"; x.fillStyle = "#4b4337"; x.font = font(600, 26); x.fillText(d.name, sx, sy);
      x.fillStyle = "#e6dcc4"; rounded(x, sx + 100, sy - 10, 210, 20, 10); x.fill();
      x.fillStyle = rare ? "#d9a441" : "#59836a"; rounded(x, sx + 100, sy - 10, 210 * d.value / 100, 20, 10); x.fill();
      x.textAlign = "right"; x.fillStyle = "#2f2a24"; x.font = font(700, 26); x.fillText(d.value, sx + 360, sy);
    });

    // สกิล
    y += 3 * 50 + 14;
    x.fillStyle = rare ? "#f6e7bd" : "#e3efe6"; rounded(x, X + 34, y - 20, W - 68, 150, 14); x.fill();
    x.textAlign = "left"; x.fillStyle = rare ? "#7a5410" : "#2f5a44"; x.font = font(700, 28); x.fillText(`สกิล · ${s.item}`, X + 58, y + 14);
    x.fillStyle = "#3b342a"; x.font = font(500, 26);
    wrap(x, s.fortune, W - 120).slice(0, 2).forEach((l, i) => x.fillText(l, X + 58, y + 58 + i * 38));

    // แท็กเพื่อน เว้นพื้นที่ให้วางสติกเกอร์ mention
    x.textAlign = "center";
    x.fillStyle = "rgba(255,255,255,.1)"; rounded(x, 110, 1640, 860, 110, 22); x.fill();
    x.strokeStyle = "rgba(255,244,214,.55)"; x.setLineDash([12, 10]); x.lineWidth = 3; rounded(x, 110, 1640, 860, 110, 22); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#fff4d6"; x.font = font(700, 32); x.fillText(S().tagline, 540, 1678);
    x.fillStyle = "rgba(255,244,214,.75)"; x.font = font(500, 24); x.fillText("วางสติกเกอร์ @ ตรงนี้", 540, 1722);

    const url = c.toDataURL("image/png");
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const file = blob && new File([blob], "healer-card.png", { type: "image/png" });
    const canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
    const view = document.createElement("div");
    view.className = "viewer";
    view.innerHTML = `<div>
      <img src="${url}" alt="การ์ดผู้เยียวยาสาขา ${esc(s.name)}">
      <p>${canShare ? "กดแชร์ แล้วเลือก Instagram หรือกดค้างที่รูปเพื่อบันทึก" : "กดค้างที่รูปเพื่อบันทึก แล้วนำไปลงสตอรี่"}</p>
      <div class="actions">
        ${canShare ? `<button class="btn" id="share" type="button">แชร์</button>` : `<a class="btn" href="${url}" download="healer-card.png">ดาวน์โหลดรูป</a>`}
        <button class="btn ghost" id="closeV" type="button">ปิด</button>
      </div>
    </div>`;
    document.body.append(view);
    view.querySelector("#closeV").addEventListener("click", () => view.remove());
    const share = view.querySelector("#share");
    if (share) share.addEventListener("click", () => navigator.share({ files: [file], text: S().shareText }).catch(() => {}));
  }

  // ---------- เก็บข้อมูล ----------
  function readQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return []; }
  }
  function writeQueue(items) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-50))); } catch (e) { /* เบราว์เซอร์ไม่ให้เก็บ */ }
  }
  async function post(record) {
    await fetch(GAME.endpoint, {
      method: "POST", mode: "no-cors", keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(record),
    });
  }
  async function send(fields) {
    // ยังไม่เปิดเก็บข้อมูล จนกว่าจะใส่ endpoint ใน data.js
    if (!GAME.endpoint) return;
    const record = { session: state.session, sentAt: new Date().toISOString(), ...fields };
    try { await post(record); } catch (e) { writeQueue([...readQueue(), record]); }
  }
  // ส่งข้อมูลที่ค้างอยู่อีกครั้ง เมื่ออินเทอร์เน็ตในงานกลับมา
  async function flush() {
    if (!GAME.endpoint) return;
    const pending = readQueue();
    if (!pending.length) return;
    writeQueue([]);
    for (let i = 0; i < pending.length; i++) {
      try { await post(pending[i]); } catch (e) { writeQueue([...readQueue(), ...pending.slice(i)]); return; }
    }
  }
  addEventListener("online", flush);

  Object.values(GAME.speakers).forEach(src => { new Image().src = src; });
  Promise.all([Scenes.start(0), ENGINE.loadSheet()]).then(showIntro);
  flush();
})();

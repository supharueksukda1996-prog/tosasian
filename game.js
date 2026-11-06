(() => {
  const stage = document.getElementById("stage");
  const pack = document.getElementById("pack");
  const dim = document.getElementById("dim");
  const flash = document.getElementById("flash");
  const QUEUE_KEY = "aurelen-queue";

  const state = { nick: "", audience: "", picks: [], items: [], startedAt: 0, session: "", result: null };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fill = text => text.replace("{weapon}", state.items[0] ? state.items[0].item : "อาวุธ");

  // ---------- หน้าแรก ----------
  function showIntro() {
    pack.hidden = true;
    dim.classList.remove("on");
    stage.innerHTML = `
      <section class="intro">
        <header class="hero">
          <small>จบแล้วไปไหน · คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น</small>
          <h1>ม้วนคัมภีร์<br>แห่งออเรเลน</h1>
          <p>จอมมารตื่นแล้ว อุปกรณ์ปราบมันมี 6 ชิ้น<br>และชิ้นสุดท้ายรอคุณอยู่ที่ซุ้มหนึ่งในงานนี้</p>
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
          <button class="btn" type="submit">ออกเดินทาง</button>
          ${GAME.endpoint ? `<p class="notice">ผู้จัดงานเก็บชั้นปี ตัวเลือกในเรื่อง และสาขาที่ได้แบบไม่ระบุตัวตน เพื่อใช้ปรับปรุงกิจกรรม ชื่อบนการ์ดจะไม่ถูกส่งออกจากเครื่อง การกดออกเดินทางถือว่ายินยอมตามนี้</p>` : ""}
        </form>
      </section>`;
    document.getElementById("intro").addEventListener("submit", e => {
      e.preventDefault();
      state.nick = document.getElementById("nick").value.trim();
      state.audience = GAME.endpoint ? document.getElementById("aud").value : "";
      state.picks = [];
      state.items = [];
      state.startedAt = Date.now();
      state.session = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      pack.hidden = false;
      renderPack();
      playChapter(0, true);
    });
  }

  function renderPack() {
    const slots = GAME.chapters.filter(c => c.options).length + 1;
    pack.innerHTML = Array.from({ length: slots }, (_, i) => {
      const it = state.items[i];
      if (it) return `<span class="slot full" title="${esc(it.item)}">${it.img ? `<img src="${esc(it.img)}" alt="">` : it.icon}</span>`;
      return `<span class="slot ${i === slots - 1 ? "last" : ""}">${i === slots - 1 ? "?" : i + 1}</span>`;
    }).join("");
  }

  // ---------- เล่าเรื่องทีละจังหวะ ----------
  function shell(chapter, inner) {
    stage.innerHTML = `<section class="scene-ui ${chapter.dark ? "dark" : ""}"><div class="place">${esc(chapter.place)}</div>${inner}</section>`;
  }

  function lineHTML(who, text) {
    return `${who ? `<span class="who">${esc(who)}</span>` : ""}<span class="line">${esc(fill(text))}</span>`;
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
    await playBeats(chapter);
    if (chapter.options) showOptions(i);
    else showNext(i);
  }

  function playBeats(chapter) {
    return new Promise(resolve => {
      let n = 0;
      const render = () => {
        const [who, text] = chapter.beats[n];
        shell(chapter, talkHTML(who, `<button class="dialog" type="button" id="beat">${lineHTML(who, text)}<span class="more">แตะเพื่ออ่านต่อ</span></button>`));
        document.getElementById("beat").addEventListener("click", () => {
          n++;
          if (n < chapter.beats.length) render();
          else resolve();
        });
      };
      render();
    });
  }

  function showOptions(i) {
    const chapter = GAME.chapters[i];
    lastSpeaker = "";
    shell(chapter, `
      <div class="dialog static">
        <span class="ask">${esc(chapter.ask)}</span>
        <div class="options">
          ${chapter.options.map((o, n) => `<button class="option" type="button" data-n="${n}">${esc(o.text)}</button>`).join("")}
        </div>
      </div>`);
    stage.querySelectorAll(".option").forEach(btn => btn.addEventListener("click", () => {
      const o = chapter.options[Number(btn.dataset.n)];
      state.picks.push("ABC"[Number(btn.dataset.n)]);
      state.items.push({ item: o.item, icon: o.icon });
      renderPack();
      shell(chapter, `
        ${talkHTML(o.who, `<div class="dialog static">
          ${lineHTML(o.who, o.reply)}
          <span class="loot">${o.icon} ได้รับ ${esc(o.item)}</span>
        </div>`)}
        <button class="btn" type="button" id="go">เดินทางต่อ</button>`);
      document.getElementById("go").addEventListener("click", () => playChapter(i + 1));
    }));
  }

  function showNext(i) {
    const chapter = GAME.chapters[i], last = i === GAME.chapters.length - 1;
    // ตอนจบซ่อนกล่องข้อความ ให้เห็นผู้ฝึกหัดชูม้วนคัมภีร์ต่อหน้าจอมมาร
    shell(chapter, `<button class="btn ${last ? "gold" : ""}" type="button" id="go">${esc(chapter.next)}</button>`);
    document.getElementById("go").addEventListener("click", () => (last ? reveal() : playChapter(i + 1)));
  }

  // ---------- สุ่มผล ----------
  function randomSpecialty() {
    const list = GAME.specialties, buf = new Uint32Array(1);
    // ตัดส่วนเกินทิ้ง เพื่อให้ทุกสาขามีโอกาสเท่ากันจริง
    const limit = Math.floor(2 ** 32 / list.length) * list.length;
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return list[buf[0] % list.length];
  }

  async function reveal() {
    state.result = randomSpecialty();
    state.items[5] = { item: state.result.item, icon: state.result.emoji, img: state.result.img };
    if (state.result.img) new Image().src = state.result.img;
    stage.innerHTML = "";
    await Promise.race([loadImage(state.result.hero), wait(2500)]);
    Scenes.shake();
    flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
    send({
      type: "result",
      audience: state.audience,
      picks: state.picks.join(""),
      specialty: state.result.id,
      specialtyName: state.result.name,
      seconds: Math.round((Date.now() - state.startedAt) / 1000),
    });
    await wait(450);
    dim.classList.add("on");
    renderPack();
    showResult();
  }

  function medal(s) {
    return s.img ? `<img src="${esc(s.img)}" alt="">` : `<span aria-hidden="true">${s.emoji}</span>`;
  }

  function showResult() {
    const s = state.result;
    stage.innerHTML = `
      <section class="result">
        <article class="scroll">
          <p class="kicker">อุปกรณ์ชิ้นสุดท้ายอยู่ที่</p>
          <div class="champion">
            <img src="${esc(s.hero)}" alt="ตัวแทนสาขา ${esc(s.name)}">
            <div class="medal">${medal(s)}</div>
          </div>
          <p class="guild">${esc(s.guild)}</p>
          <h2>${esc(s.name)}</h2>
          <span class="relic">${esc(s.item)}</span>
          <p class="trait">${esc(s.trait)}</p>
          <p class="fortune">${esc(s.fortune)}</p>
          <div class="divider"></div>
          <div class="ask-teacher"><b>คำถามชวนคุยกับอาจารย์</b>${esc(s.ask)}</div>
          <div class="kit"><b>อุปกรณ์ที่คุณเก็บมา</b>${state.items.slice(0, 5).map(it => `<span>${it.icon} ${esc(it.item)}</span>`).join("")}</div>
          <p class="mission">ไปรับอุปกรณ์ชิ้นสุดท้ายจากอาจารย์ที่ซุ้มนี้ แล้วจอมมารจะไม่มีวันชนะ</p>
        </article>
        <div class="actions">
          <button class="btn" type="button" id="save">แชร์ลงสตอรี่</button>
          <button class="btn ghost" style="color:#fff;box-shadow:inset 0 0 0 1.5px #fff" type="button" id="again">เดินทางอีกครั้ง</button>
        </div>
      </section>`;
    scrollTo(0, 0);
    document.getElementById("save").addEventListener("click", makeStory);
    document.getElementById("again").addEventListener("click", async () => {
      stage.innerHTML = "";
      dim.classList.remove("on");
      pack.hidden = true;
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

  async function makeStory() {
    const s = state.result, holder = state.nick || "ผู้ฝึกหัด";
    const font = (weight, size, family = "Sarabun") => `${weight} ${size}px ${family}, "Noto Sans Thai", sans-serif`;
    try { await Promise.all([document.fonts.load("700 80px Charmonman", "ม้วนคัมภีร์"), document.fonts.load("700 40px Sarabun", "สำนัก"), document.fonts.load("500 40px Sarabun", "สำนัก")]); } catch (e) { /* ใช้ฟอนต์สำรอง */ }
    const c = document.createElement("canvas");
    c.width = 1080; c.height = 1920;
    const x = c.getContext("2d");
    x.fillStyle = "#100d13"; x.fillRect(0, 0, 1080, 1920);
    const [hero, art] = await Promise.all([loadImage(s.hero), s.img ? loadImage(s.img) : null]);
    if (hero) x.drawImage(hero, 0, 0, 1080, 1620);

    // ไล่สีให้ตัวหนังสืออ่านง่าย และเว้นขอบบนล่างไว้ให้แถบของ Instagram
    let g = x.createLinearGradient(0, 0, 0, 340);
    g.addColorStop(0, "rgba(10,8,12,.82)"); g.addColorStop(1, "rgba(10,8,12,0)");
    x.fillStyle = g; x.fillRect(0, 0, 1080, 340);
    g = x.createLinearGradient(0, 760, 0, 1080);
    g.addColorStop(0, "rgba(16,13,19,0)"); g.addColorStop(1, "rgba(16,13,19,1)");
    x.fillStyle = g; x.fillRect(0, 760, 1080, 320);
    x.fillStyle = "#100d13"; x.fillRect(0, 1080, 1080, 840);

    x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = "rgba(0,0,0,.9)"; x.shadowBlur = 20;
    x.fillStyle = "#fff4d6"; x.font = font(700, 66, "Charmonman");
    x.fillText("ม้วนคัมภีร์แห่งออเรเลน", 540, 190);
    x.shadowBlur = 0;

    // ตราสาขา
    const bx = 540, by = 985, br = 92;
    x.fillStyle = "#fffaf0"; x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill();
    x.strokeStyle = "#d9a441"; x.lineWidth = 6; x.stroke();
    if (art) x.drawImage(art, bx - 68, by - 68, 136, 136);
    else { x.fillStyle = "#2f2a24"; x.font = `92px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`; x.fillText(s.emoji, bx, by + 4); }

    let y = 1122;
    x.fillStyle = "#d9c7a6"; x.font = font(600, 30); x.fillText(`${holder} ต้องไปรับอุปกรณ์ชิ้นสุดท้ายจาก`, 540, y);
    y += 56; x.fillStyle = "#a9cdb6"; x.font = font(600, 36); x.fillText(s.guild, 540, y);
    y += 76; x.fillStyle = "#fff8e6"; x.font = font(700, s.name.length > 15 ? 66 : 84); x.fillText(s.name, 540, y);
    y += 74; x.fillStyle = "#f3d890"; x.font = font(600, 40); x.fillText(s.item, 540, y);
    y += 62; x.fillStyle = "#f4ead8"; x.font = font(500, 32);
    for (const l of wrap(x, s.fortune, 820)) { x.fillText(l, 540, y); y += 46; }
    y += 16; x.fillStyle = "#bdb09a"; x.font = font(500, 26);
    for (const l of wrap(x, state.items.slice(0, 5).map(it => it.item).join(" · "), 880)) { x.fillText(l, 540, y); y += 38; }
    y += 34;
    x.fillStyle = "#59836a"; rounded(x, 170, y - 36, 740, 72, 14); x.fill();
    x.fillStyle = "#fff"; x.font = font(700, 30); x.fillText("แล้วคุณล่ะ จบแล้วไปไหน?", 540, y);
    y += 62; x.fillStyle = "#bdb09a"; x.font = font(500, 24); x.fillText("คณะแพทยศาสตร์ มหาวิทยาลัยขอนแก่น", 540, y);

    const url = c.toDataURL("image/png");
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    const file = blob && new File([blob], "aurelen-story.png", { type: "image/png" });
    const canShare = file && navigator.canShare && navigator.canShare({ files: [file] });
    const view = document.createElement("div");
    view.className = "viewer";
    view.innerHTML = `<div>
      <img src="${url}" alt="การ์ดผลลัพธ์สาขา ${esc(s.name)}">
      <p>${canShare ? "กดแชร์ แล้วเลือก Instagram หรือกดค้างที่รูปเพื่อบันทึก" : "กดค้างที่รูปเพื่อบันทึก แล้วนำไปลงสตอรี่"}</p>
      <div class="actions">
        ${canShare ? `<button class="btn" id="share" type="button">แชร์</button>` : `<a class="btn" href="${url}" download="aurelen-story.png">ดาวน์โหลดรูป</a>`}
        <button class="btn ghost" id="closeV" type="button">ปิด</button>
      </div>
    </div>`;
    document.body.append(view);
    view.querySelector("#closeV").addEventListener("click", () => view.remove());
    const share = view.querySelector("#share");
    if (share) share.addEventListener("click", () => navigator.share({ files: [file], text: "ฉันพร้อมปราบจอมมารแล้ว แค่ต้องไปรับอุปกรณ์ชิ้นสุดท้าย แล้วคุณล่ะ จบแล้วไปไหน?" }).catch(() => {}));
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
  Scenes.start(0).then(showIntro);
  flush();
})();

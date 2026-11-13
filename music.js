// ดนตรีประกอบแนวอินเดียที่สร้างสดในเครื่องผู้เล่น ไม่ใช้ไฟล์เพลง จึงไม่มีปัญหาลิขสิทธิ์
// มีเสียงตานปุระ (โดรนดีด) ขลุ่ยบันสุรี (ทำนองด้นจากราค) และกลองตับลา (จังหวะเกหรวา 8 จังหวะ)
// แต่ละฉากใช้อารมณ์ (mood) ต่างกัน ปรับค่าได้ใน MOODS ด้านล่าง
window.Synth = (() => {
  // อัตราส่วนเสียงแบบ just intonation เทียบกับ Sa
  const R = { S: 1, r: 16 / 15, R: 9 / 8, g: 6 / 5, G: 5 / 4, M: 4 / 3, m: 45 / 32, P: 3 / 2, d: 8 / 5, D: 5 / 3, n: 9 / 5, N: 15 / 8 };
  const scale = notes => notes.split(" ").map(k => R[k]);
  const SA = 146.83; // Sa = D3

  // tempo = จังหวะต่อนาที (นับเป็นโน้ตเขบ็ตหนึ่งชั้น), flute = โอกาสที่ขลุ่ยเล่นในแต่ละช่วง
  // tabla = รูปแบบกลอง 8 ช่อง (D=ธา หนัก, g=เก ต่ำ, n=นา ใส, t=ติน, k=กะ เบา, -=เว้น)
  const MOODS = {
    calm:    { tempo: 76,  scale: scale("S R G m P D N"), flute: .8, tabla: "D-ntn-Dn", tablaGain: .55, drone: 1, shift: 1 },
    airy:    { tempo: 66,  scale: scale("S R G P D"),     flute: .95, tabla: "D---n---", tablaGain: .35, drone: .9, shift: 1 },
    mystery: { tempo: 60,  scale: scale("S r g M P d n"), flute: .6, tabla: "g---k-n-", tablaGain: .4, drone: .9, shift: 1 },
    festive: { tempo: 104, scale: scale("S R G M P D N"), flute: .9, tabla: "Dgntnkdn", tablaGain: .7, drone: .8, shift: 1 },
    shore:   { tempo: 70,  scale: scale("S R G P D"),     flute: .85, tabla: "D-n-g-n-", tablaGain: .45, drone: .9, shift: 1 },
    bright:  { tempo: 84,  scale: scale("S R G m P D N"), flute: .9, tabla: "D-ntD-tn", tablaGain: .6, drone: .9, shift: 1 },
    dark:    { tempo: 92,  scale: scale("S r g m P d N"), flute: .35, tabla: "D-gDg-Dk", tablaGain: .85, drone: 1.2, shift: .5, ominous: true },
    triumph: { tempo: 112, scale: scale("S R G M P D N"), flute: 1, tabla: "Dgnt-nDn", tablaGain: .75, drone: .9, shift: 1 },
  };
  // ลำดับเดียวกับฉากใน scenes.js
  const BY_SCENE = ["calm", "airy", "mystery", "festive", "shore", "bright", "dark"];

  let ctx = null, master = null, wet = null, dry = null, noiseBuf = null;
  let mood = MOODS.calm, step = 0, nextTime = 0, timer = null, droneAt = 0, droneIdx = 0;
  let melody = { idx: 7, rest: 0 }, lastFlute = null;

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);
    // เสียงก้องแบบห้องโถง สร้างจากสัญญาณรบกวนที่ค่อย ๆ จางลง
    const verb = ctx.createConvolver(), len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = .32;
    dry = ctx.createGain(); dry.gain.value = .9;
    wet.connect(verb).connect(master);
    dry.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }

  function out(node, reverb = .5) {
    const a = ctx.createGain(), b = ctx.createGain();
    a.gain.value = 1 - reverb * .5; b.gain.value = reverb;
    node.connect(a).connect(dry); node.connect(b).connect(wet);
  }

  // ---------- ตานปุระ: ดีดวน Pa Sa' Sa' Sa เสียงหึ่งยาว ----------
  function tanpura(t, ratio) {
    const f = SA * mood.shift * ratio / 2, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 3;
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05 * mood.drone, t + .03); g.gain.exponentialRampToValueAtTime(.0005, t + 4.2);
    [0, 3.2, -2.6].forEach(cents => {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = f; o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + 4.4);
    });
    lp.connect(g); out(g, .55);
  }

  // ---------- ขลุ่ยบันสุรี: ไล่โน้ตในราค มีไวบราโตและลมหายใจ ----------
  function flute(t, ratio, dur) {
    const f = SA * mood.shift * ratio * 2;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o2.type = "sine";
    const from = lastFlute || f;
    // เอื้อนเสียงจากโน้ตก่อนหน้า (มีนด์)
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(f, t + Math.min(.14, dur * .3));
    o2.frequency.setValueAtTime(from * 2, t); o2.frequency.exponentialRampToValueAtTime(f * 2, t + Math.min(.14, dur * .3));
    lastFlute = f;
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 5.2; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * .012, t + dur * .7);
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const h = ctx.createGain(); h.gain.value = .18;
    o.connect(g); o2.connect(h).connect(g);
    const peak = mood.ominous ? .05 : .085;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .07);
    g.gain.setValueAtTime(peak * .9, t + dur * .75); g.gain.exponentialRampToValueAtTime(.0005, t + dur + .25);
    // เสียงลม
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuf; bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 2.5;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(.018, t + .05); ng.gain.exponentialRampToValueAtTime(.0005, t + dur * .6 + .1);
    n.connect(bp).connect(ng).connect(g);
    [o, o2, vib].forEach(x => { x.start(t); x.stop(t + dur + .3); });
    n.start(t); n.stop(t + dur + .2);
    out(g, .6);
  }

  // ---------- ตับลา ----------
  function drum(t, kind) {
    const gain = mood.tablaGain;
    if (kind === "D" || kind === "g" || kind === "d") {
      // บายัน: เสียงต่ำที่ระดับเสียงไหลลง (กลองซ้าย)
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      const hi = kind === "d" ? 95 : 120;
      o.frequency.setValueAtTime(hi * (mood.ominous ? .8 : 1), t);
      o.frequency.exponentialRampToValueAtTime(58, t + .35);
      const v = (kind === "g" ? .3 : .5) * gain;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0008, t + .55);
      o.connect(g); out(g, .25); o.start(t); o.stop(t + .6);
    }
    if (kind === "D" || kind === "n" || kind === "t" || kind === "d") {
      // ดายัน: เสียงกังวานใส (กลองขวา) ตั้งตรง Sa สูง
      const f = SA * mood.shift * 4, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o2.type = "sine";
      o.frequency.value = f; o2.frequency.value = f * 2.76;
      const v = (kind === "t" ? .08 : .14) * gain, len = kind === "t" ? .5 : .28;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0005, t + len);
      o.connect(g); o2.connect(g); out(g, .3);
      o.start(t); o2.start(t); o.stop(t + len + .05); o2.stop(t + len + .05);
    }
    // เสียงนิ้วกระทบหนัง
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuf; bp.type = "bandpass"; bp.frequency.value = kind === "k" ? 1800 : 3200; bp.Q.value = 1.2;
    const v = (kind === "k" ? .06 : .1) * gain;
    ng.gain.setValueAtTime(v, t); ng.gain.exponentialRampToValueAtTime(.0005, t + .06);
    n.connect(bp).connect(ng); out(ng, .2); n.start(t, Math.random() * .5); n.stop(t + .08);
  }

  // เสียงหึ่งต่ำน่ากลัวสำหรับฉากราชาอสูร
  function ominousPad(t, dur) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 420;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + 1.2); g.gain.linearRampToValueAtTime(0, t + dur);
    [1, R.r].forEach(r => {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = SA * .25 * r; o.connect(lp); o.start(t); o.stop(t + dur + .1);
    });
    lp.connect(g); out(g, .5);
  }

  // ---------- ตัวจัดคิวโน้ต ----------
  function schedule() {
    const beat = 60 / mood.tempo / 2; // โน้ตเขบ็ตหนึ่งชั้น
    while (nextTime < ctx.currentTime + .25) {
      const t = nextTime;
      // ตานปุระดีดทุก ~1.1 วินาที ไม่ขึ้นกับจังหวะกลอง
      if (t >= droneAt) {
        tanpura(t, [R.P / 2 * 2, 2, 2, 1][droneIdx % 4]);
        droneIdx++; droneAt = t + 1.1;
        if (mood.ominous && droneIdx % 4 === 1) ominousPad(t, 4.4);
      }
      const k = mood.tabla[step % 8];
      if (k !== "-") drum(t, k);
      // ขลุ่ย: ด้นทีละวลี เดินทีละขั้นในราค พักบ้าง
      if (melody.rest > 0) melody.rest--;
      else if (Math.random() < mood.flute) {
        const sc = mood.scale, n = sc.length;
        const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
        melody.idx = Math.max(0, Math.min(n * 2 - 1, melody.idx + move));
        if (Math.random() < .12) melody.idx = n; // กลับมาที่ Sa บนบ่อย ๆ
        const ratio = sc[melody.idx % n] * (melody.idx >= n ? 2 : 1);
        const len = [1, 2, 2, 3, 4][Math.floor(Math.random() * 5)];
        flute(t, ratio / 2, len * beat);
        melody.rest = len - 1 + (Math.random() < .2 ? 4 : 0);
      } else melody.rest = 2;
      step++;
      nextTime += beat;
    }
  }

  function setVolume(v, ms = 1200) {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    // คูณ 1.8 ให้ดังพอสำหรับลำโพงมือถือ ตัวบีบเสียงด้านหลังกันไม่ให้แตก
    master.gain.linearRampToValueAtTime(v * 1.8, now + ms / 1000);
  }

  return {
    start(volume) {
      if (!ctx) setup();
      if (ctx.state === "suspended") ctx.resume();
      if (!timer) {
        nextTime = ctx.currentTime + .1; droneAt = nextTime;
        timer = setInterval(schedule, 60);
      }
      setVolume(volume);
    },
    setVolume,
    // เปลี่ยนอารมณ์เพลงตามฉาก รับเลขฉากหรือชื่ออารมณ์
    mood(key) {
      const name = typeof key === "number" ? BY_SCENE[key] : key;
      if (MOODS[name]) { mood = MOODS[name]; lastFlute = null; }
    },
    pause() { if (ctx) ctx.suspend(); },
    resume() { if (ctx) ctx.resume(); },
  };
})();

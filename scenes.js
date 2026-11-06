// ฉากของนครออเรเลน ใช้ภาพวาดเป็นพื้นหลัง แล้วซ้อนแอนิเมชันด้วยโค้ด
(() => {
  const view = document.getElementById("view");
  const ctx = view.getContext("2d");
  const DPR = Math.min(devicePixelRatio || 1, 1.75);
  const QUIET = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IMG_W = 864, IMG_H = 1536;
  let VW, VH;

  // ---------- เครื่องมือพื้นฐาน ----------
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = t => t * t * (3 - 2 * t);
  const particles = (n, seed, make) => { const r = rng(seed); return Array.from({ length: n }, (_, i) => make(r, i)); };
  const withAlpha = (color, a) => color.replace(/[\d.]+\)$/, a + ")");

  const glowCache = {};
  function glowSprite(color) {
    if (glowCache[color]) return glowCache[color];
    const s = document.createElement("canvas"); s.width = s.height = 128;
    const c = s.getContext("2d"), g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color); g.addColorStop(.25, withAlpha(color, parseFloat(color.match(/[\d.]+\)$/)[0]) * .45)); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return (glowCache[color] = s);
  }
  function glow(c, x, y, r, color, alpha = 1) {
    const prev = c.globalCompositeOperation, a = c.globalAlpha;
    c.globalCompositeOperation = "lighter"; c.globalAlpha = a * alpha;
    c.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    c.globalCompositeOperation = prev; c.globalAlpha = a;
  }

  const fogCache = {};
  function fogSprite(color) {
    if (fogCache[color]) return fogCache[color];
    const s = document.createElement("canvas"); s.width = 640; s.height = 260;
    const c = s.getContext("2d"), r = rng(31);
    for (let i = 0; i < 90; i++) {
      const x = 90 + r() * 460, y = 130 + (r() - .5) * 120 * Math.sin((x / 640) * Math.PI), rad = 30 + r() * 70;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, color); g.addColorStop(1, withAlpha(color, 0));
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    return (fogCache[color] = s);
  }

  // ---------- แอนิเมชันที่ซ้อนบนภาพ ----------
  function fxPetals(n, seed, colors = ["#ffc7d8", "#ffe0e8", "#f79fbe"], o = {}) {
    const { yMax = 1.1, speed = 1 } = o;
    const list = particles(n, seed, r => ({ x: r(), y: r(), s: 2.2 + r() * 4, v: (.018 + r() * .03) * speed, p: r() * 7, c: colors[r() * colors.length | 0] }));
    return (c, t) => list.forEach(p => {
      const y = ((p.y + t * p.v) % yMax) - .05, x = ((p.x - t * p.v * .55 + Math.sin(t * .9 + p.p) * .018 + 2) % 1.1) - .05;
      c.save(); c.translate(x * VW, y * VH); c.rotate(t * 1.4 + p.p); c.scale(1, Math.abs(Math.sin(t * 2 + p.p)) * .8 + .2);
      c.fillStyle = p.c; c.beginPath(); c.ellipse(0, 0, p.s, p.s * .58, 0, 0, 7); c.fill(); c.restore();
    });
  }
  function fxMotes(n, seed, color, o = {}) {
    const { yMin = .2, yMax = .75, size = 13 } = o;
    const list = particles(n, seed, r => ({ x: r(), y: lerp(yMin, yMax, r()), p: r() * 7, s: size * (.5 + r()), w: .3 + r() * .7 }));
    return (c, t) => list.forEach(p => {
      const x = p.x * VW + Math.sin(t * .4 * p.w + p.p) * 24, y = p.y * VH + Math.cos(t * .33 * p.w + p.p * 2) * 18;
      glow(c, x, y, p.s, color, .3 + .7 * Math.pow(.5 + .5 * Math.sin(t * 1.6 * p.w + p.p), 2));
    });
  }
  function fxFog(n, seed, color, yMin, yMax, o = {}) {
    const list = particles(n, seed, r => ({ x: r(), y: lerp(yMin, yMax, r()), w: (o.w || 1.1) * (.7 + r() * .7), v: (.006 + r() * .012) * (r() > .5 ? 1 : -1), a: (o.alpha || .6) * (.5 + r() * .5) }));
    return (c, t) => {
      const spr = fogSprite(color);
      list.forEach(p => {
        const w = p.w * VW, h = w * .4, x = ((p.x + t * p.v) % 1 + 1) % 1;
        c.globalAlpha = p.a;
        c.drawImage(spr, lerp(-w, VW, x), p.y * VH - h / 2, w, h);
      });
      c.globalAlpha = 1;
    };
  }
  // วาดลำแสงครั้งเดียวที่ความละเอียดต่ำ แล้วแค่ขยับและเปลี่ยนความสว่าง เพื่อให้ลื่นบนมือถือ
  function fxRays(point, color, n, o = {}) {
    const r = rng(77), rays = Array.from({ length: n }, (_, i) => ({ a: lerp(o.from, o.to, (i + r() * .7) / n), w: .03 + r() * .06 }));
    const px = point.x, py = point.y, len = Math.max(VW, VH) * (o.len || 1.3), M = 1.4;
    const sprite = document.createElement("canvas");
    sprite.width = Math.ceil(VW * M * .5); sprite.height = Math.ceil(VH * M * .5);
    const s = sprite.getContext("2d");
    s.scale(.5, .5); s.translate(VW * (M - 1) / 2, VH * (M - 1) / 2); s.globalCompositeOperation = "lighter";
    rays.forEach(ray => {
      const g = s.createLinearGradient(px, py, px + Math.cos(ray.a) * len, py + Math.sin(ray.a) * len);
      g.addColorStop(0, withAlpha(color, 0)); g.addColorStop(.14, color); g.addColorStop(.72, withAlpha(color, parseFloat(color.match(/[\d.]+\)$/)[0]) * .25)); g.addColorStop(1, withAlpha(color, 0));
      s.fillStyle = g; s.globalAlpha = .17;
      // ซ้อนลำแสงหลายชั้นให้ขอบฟุ้ง
      for (let k = 1; k <= 5; k++) {
        const w = ray.w * k * .34;
        s.beginPath(); s.moveTo(px, py);
        s.lineTo(px + Math.cos(ray.a - w) * len, py + Math.sin(ray.a - w) * len);
        s.lineTo(px + Math.cos(ray.a + w) * len, py + Math.sin(ray.a + w) * len);
        s.fill();
      }
    });
    return (c, t) => {
      c.save();
      c.globalCompositeOperation = "lighter";
      c.translate(px, py); c.rotate(Math.sin(t * .09) * .018);
      c.globalAlpha = .72 + .28 * Math.sin(t * .4);
      c.drawImage(sprite, -px - VW * (M - 1) / 2, -py - VH * (M - 1) / 2, VW * M, VH * M);
      c.restore();
    };
  }
  // ทำให้น้ำตกบนภาพไหลได้ด้วยริ้วน้ำบาง ๆ และละอองที่เชิงน้ำตก รองรับน้ำตกที่ตกเฉียงด้วย x1
  function fxFalls(map, falls) {
    const streaks = falls.flatMap((f, n) => particles(Math.round(f.w * .75 + 6), 300 + n, r => ({ f, x: r() - .5, p: r(), v: .42 + r() * .3, l: .1 + r() * .16, a: .2 + r() * .42, lw: .5 + r() * 1.1 })));
    return (c, t) => {
      c.lineCap = "round";
      streaks.forEach(s => {
        const { f } = s, tt = (t * s.v + s.p) % 1, k = tt * tt, x1 = f.x1 === undefined ? f.x : f.x1;
        const head = map.point(lerp(f.x, x1, k) + s.x * f.w, lerp(f.y0, f.y1, k));
        const tailK = Math.min(1, k + s.l * (.4 + tt));
        const tail = map.point(lerp(f.x, x1, tailK) + s.x * f.w, lerp(f.y0, f.y1, tailK));
        c.strokeStyle = `rgba(255,251,238,${s.a * Math.sin(tt * Math.PI)})`; c.lineWidth = s.lw;
        c.beginPath(); c.moveTo(head.x, head.y); c.lineTo(tail.x, tail.y); c.stroke();
      });
      const spr = fogSprite("rgba(255,244,226,.2)");
      falls.forEach((f, i) => {
        const p = map.point(f.x1 === undefined ? f.x : f.x1, f.y1), w = f.w * map.scale * 2.2 * (1 + Math.sin(t * .9 + i) * .1);
        c.globalAlpha = .7 + Math.sin(t * .7 + i * 2) * .2;
        c.drawImage(spr, p.x - w / 2, p.y - w * .24, w, w * .4);
      });
      c.globalAlpha = 1;
    };
  }
  // ดวงไฟบนภาพที่กะพริบเบา ๆ เช่น โคม หน้าต่าง เห็ดเรืองแสง
  function fxFlicker(map, points, color, size, o = {}) {
    const { speed = 3, depth = .35 } = o;
    return (c, t) => points.forEach(([x, y, s = 1], i) => {
      const p = map.point(x, y), wave = Math.sin(t * speed + i * 2.4) * .6 + Math.sin(t * speed * 2.3 + i) * .4;
      glow(c, p.x, p.y, size * s * map.scale * (1 + wave * depth * .3), color, 1 - depth + wave * depth);
    });
  }
  function fxTwinkle(map, n, seed, x0, y0, x1, y1) {
    const list = particles(n, seed, r => ({ x: lerp(x0, x1, r()), y: lerp(y0, y1, r()), s: 3 + r() * 8, p: r() * 7, v: 1 + r() * 2.4 }));
    return (c, t) => list.forEach(s => {
      const a = Math.pow(.5 + .5 * Math.sin(t * s.v + s.p), 5);
      if (a < .03) return;
      const p = map.point(s.x, s.y);
      glow(c, p.x, p.y, s.s, "rgba(235,235,255,.95)", a);
    });
  }
  function fxAurora(map, curtains) {
    const sprite = document.createElement("canvas"); sprite.width = 240; sprite.height = 200;
    const s = sprite.getContext("2d"), r = rng(9);
    for (let x = 0; x < 240; x += 3) {
      const a = .08 + r() * .3 * Math.sin((x / 240) * Math.PI);
      const g = s.createLinearGradient(0, 0, 0, 200);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(.7, `rgba(255,255,255,${a})`); g.addColorStop(1, "rgba(255,255,255,0)");
      s.fillStyle = g; s.fillRect(x, 20 + Math.sin(x * .05) * 16, 3.5, 180);
    }
    const tinted = curtains.map(cur => {
      const out = document.createElement("canvas"); out.width = 240; out.height = 200;
      const o = out.getContext("2d");
      o.drawImage(sprite, 0, 0); o.globalCompositeOperation = "source-in"; o.fillStyle = cur.color; o.fillRect(0, 0, 240, 200);
      return out;
    });
    return (c, t) => {
      c.save(); c.globalCompositeOperation = "lighter";
      curtains.forEach((cur, i) => {
        const p = map.point(cur.x, cur.y), w = cur.w * map.scale, h = cur.h * map.scale, sway = Math.sin(t * .22 + i * 2) * w * .08;
        c.globalAlpha = .34 + .3 * Math.sin(t * .36 + i * 1.7);
        c.drawImage(tinted[i], p.x + sway, p.y, w * (1 + Math.sin(t * .17 + i) * .05), h);
      });
      c.restore();
    };
  }
  function fxSkyLanterns(n, seed, yStart, yEnd) {
    const list = particles(n, seed, r => ({ x: r(), y: r(), z: .25 + r() * .75, v: .012 + r() * .018, p: r() * 7 })).sort((a, b) => a.z - b.z);
    return (c, t) => list.forEach(l => {
      const k = ((l.y + t * l.v) % 1), y = lerp(yStart, yEnd, k) * VH, x = (l.x + Math.sin(t * .24 + l.p) * .016) * VW, s = 6.5 * l.z * (1 - k * .6);
      const a = clamp(k * 6) * clamp((1 - k) * 4);
      if (a <= 0) return;
      glow(c, x, y, s * 5, "rgba(255,160,70,.72)", a);
      c.globalAlpha = a;
      c.fillStyle = "#ffd98a";
      c.beginPath(); c.moveTo(x - s * .65, y - s * .9); c.lineTo(x + s * .65, y - s * .9); c.lineTo(x + s * .42, y + s * .9); c.lineTo(x - s * .42, y + s * .9); c.fill();
      c.globalAlpha = 1;
    });
  }
  // ผิวน้ำไหวจริง โดยเลื่อนภาพสะท้อนทีละแถวตามคลื่น ยิ่งใกล้กล้องยิ่งไหวมาก
  function fxWater(map, y0, y1) {
    const STEP = 5;
    return (c, t) => {
      const img = map.image();
      if (!img) return;
      for (let y = y0; y < y1; y += STEP) {
        const k = (y - y0) / (y1 - y0), amp = .25 + k * k * 5;
        const wob = Math.sin(y * .09 + t * 1.2) * amp + Math.sin(y * .031 - t * .7) * amp * .8;
        const p = map.point(0, y);
        c.drawImage(img, 0, y, IMG_W, STEP + 1, p.x + wob, p.y, IMG_W * map.scale, (STEP + 1) * map.scale);
      }
    };
  }
  function fxSmoke(map, x, y) {
    const list = particles(9, 5, r => ({ p: r(), v: .07 + r() * .05, d: (r() - .5) * 26 }));
    const spr = fogSprite("rgba(240,232,235,.12)");
    return (c, t) => list.forEach(s => {
      const k = (t * s.v + s.p) % 1, p = map.point(x + s.d * k + k * 22, y - k * 110), w = (18 + k * 74) * map.scale;
      c.globalAlpha = Math.sin(k * Math.PI) * .75;
      c.drawImage(spr, p.x - w / 2, p.y - w * .2, w, w * .4);
      c.globalAlpha = 1;
    });
  }
  function fxWake(map, x, y) {
    return (c, t) => {
      c.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        const k = (t * .16 + i / 5) % 1, p = map.point(x - k * 90, y + k * 4), w = (22 + k * 88) * map.scale;
        c.strokeStyle = `rgba(255,240,230,${(1 - k) * .4})`; c.lineWidth = 1;
        c.beginPath(); c.moveTo(p.x - w / 2, p.y + k * 3); c.quadraticCurveTo(p.x, p.y - k * 2, p.x + w / 2, p.y + k * 3); c.stroke();
      }
    };
  }
  function drawDragon(c, x, y, size, t, color, wingLight, dir = 1) {
    const flap = Math.sin(t * 7);
    c.save(); c.translate(x, y); c.scale(dir, 1); c.rotate(Math.sin(t * 1.2) * .08);
    c.fillStyle = wingLight;
    for (const side of [0, 1]) {
      const lift = (side ? .78 : 1) * flap;
      c.beginPath(); c.moveTo(-size * .1, -size * .08);
      c.quadraticCurveTo(-size * .35, -size * (.5 + lift * .55), -size * .95, -size * (.26 + lift * .8));
      c.quadraticCurveTo(-size * .6, -size * (.1 + lift * .22), -size * .55, size * .06);
      c.quadraticCurveTo(-size * .32, -size * .04, -size * .08, size * .08); c.fill();
    }
    c.strokeStyle = color; c.lineWidth = size * .1; c.lineCap = "round";
    c.beginPath(); c.moveTo(-size * .28, size * .05); c.quadraticCurveTo(-size * .74, size * .1, -size * 1.08, size * Math.sin(t * 3) * .12); c.stroke();
    c.fillStyle = color;
    c.beginPath(); c.ellipse(0, 0, size * .38, size * .17, -.12, 0, 7); c.fill();
    c.beginPath(); c.moveTo(size * .2, -size * .08); c.quadraticCurveTo(size * .42, -size * .24, size * .52, -size * .26); c.lineTo(size * .72, -size * .2); c.lineTo(size * .5, -size * .1); c.quadraticCurveTo(size * .38, 0, size * .25, size * .06); c.fill();
    c.restore();
  }
  function fxBirds(n, seed, color, y0, y1) {
    const list = particles(n, seed, r => ({ x: r(), y: lerp(y0, y1, r()), s: 2.5 + r() * 3.5, v: .012 + r() * .018, p: r() * 7 }));
    return (c, t) => {
      c.strokeStyle = color; c.lineCap = "round"; c.lineWidth = 1.2;
      list.forEach(b => {
        const x = ((b.x + t * b.v) % 1.2 - .1) * VW, y = b.y * VH + Math.sin(t * .5 + b.p) * 6, f = Math.sin(t * 6 + b.p) * b.s * .55;
        c.beginPath(); c.moveTo(x - b.s, y - f); c.quadraticCurveTo(x - b.s * .3, y - 1, x, y); c.quadraticCurveTo(x + b.s * .3, y - 1, x + b.s, y - f); c.stroke();
      });
    };
  }

  function fxEmbers(n, seed) {
    const list = particles(n, seed, r => ({ x: r(), y: r(), s: 3 + r() * 6, v: .03 + r() * .05, p: r() * 7 }));
    return (c, t) => list.forEach(e => {
      const k = (e.y + t * e.v) % 1, x = (e.x + Math.sin(t * .8 + e.p) * .03) * VW, y = (1.02 - k * 1.05) * VH;
      glow(c, x, y, e.s, "rgba(255,110,50,.95)", Math.sin(k * Math.PI) * (.5 + .5 * Math.sin(t * 4 + e.p)));
    });
  }
  // ควันดำที่ค่อย ๆ คืบขึ้นจากด้านล่าง
  function fxCreep(n, seed) {
    const list = particles(n, seed, r => ({ x: r(), y: r(), w: 1.1 + r() * .8, v: (.008 + r() * .012) * (r() > .5 ? 1 : -1), a: .4 + r() * .4 }));
    return (c, t) => {
      const spr = fogSprite("rgba(14,9,12,.62)"), rise = smooth(clamp(t / 16));
      list.forEach(f => {
        const w = f.w * VW, x = ((f.x + t * f.v) % 1 + 1) % 1, y = lerp(1.02, lerp(.62, .92, f.y), rise) * VH;
        c.globalAlpha = f.a;
        c.drawImage(spr, lerp(-w, VW, x), y - w * .2, w, w * .4);
      });
      c.globalAlpha = 1;
    };
  }
  function fxLightning(map, x, y) {
    return (c, t) => {
      const k = t % 5.3;
      if (k > .32) return;
      const a = k < .08 ? 1 : k < .16 ? .25 : k < .24 ? .8 : .15, p = map.point(x, y);
      c.fillStyle = `rgba(255,190,150,${a * .13})`;
      c.fillRect(-VW * .5, -VH * .5, VW * 2, VH * 2);
      glow(c, p.x, p.y, VW * .6, "rgba(255,190,150,.7)", a);
    };
  }

  // ---------- ฉากทั้งเจ็ด ----------
  // ภาพและสิ่งที่ผูกกับภาพใช้ความลึก 0.5 เท่ากัน เพื่อไม่ให้เลื่อนหลุดตำแหน่งเมื่อกล้องขยับ
  const SCENES = [
    { key: "ceremony", title: "พิธีจบใต้ต้นกัลปพฤกษ์", line: "ใต้ต้นไม้พันปี คุณรับม้วนคัมภีร์ชะตาที่ยังว่างเปล่า",
      painting: "art/ceremony.webp",
      cam: { x: [-.008, .004], y: [.01, 0], zoom: [1.14, 1.0] },
      build(add, map) {
        add(.5, fxRays(map.point(768, 538), "rgba(255,214,150,.26)", 11, { from: 2.5, to: 3.9 }));
        add(.5, (c, t) => { const s = map.point(768, 538); glow(c, s.x, s.y, VW * (.34 + Math.sin(t * .5) * .025), "rgba(255,218,140,.6)"); });
        add(.5, fxFlicker(map, [[101, 781], [153, 786], [205, 787], [255, 790], [302, 792], [352, 795], [403, 797], [450, 798], [492, 800]], "rgba(255,190,90,.9)", 30));
        add(.5, fxTwinkle(map, 14, 21, 640, 740, 790, 790));
        add(.62, fxMotes(16, 8, "rgba(255,224,150,.8)", { yMin: .28, yMax: .62, size: 6 }));
        add(.8, fxPetals(46, 6));
        add(1.1, fxPetals(10, 16, ["#ffd5e0", "#f7a8c2"], { speed: 1.6 }));
      } },

    { key: "bridge", title: "สะพานเหนือหุบเหว", line: "สะพานหินโบราณทอดข้ามเมฆ ลูกมังกรปีกเจ็บกำลังบินโซเซมาหาคุณ",
      painting: "art/bridge.webp",
      cam: { x: [.004, -.004], y: [-.02, .01], zoom: [1.0, 1.12] },
      build(add, map) {
        add(.42, fxFog(5, 22, "rgba(255,255,255,.62)", .34, .5, { alpha: .2, w: .9 }));
        add(.5, fxFalls(map, [
          { x: 125, x1: 205, y0: 512, y1: 1125, w: 62 },
          { x: 752, x1: 700, y0: 502, y1: 1040, w: 44 },
          { x: 440, y0: 625, y1: 735, w: 10 },
        ]));
        add(.5, fxBirds(7, 3, "rgba(46,62,90,.6)", .1, .3));
        add(.5, (c, t) => {
          // ลูกมังกรปีกเจ็บ บินวนโซเซหน้าสะพาน
          const k = t * .3, a = map.point(430 + Math.sin(k) * 250, 345 + Math.sin(k * 1.7) * 55 + Math.abs(Math.sin(t * 1.7)) * 13);
          drawDragon(c, a.x, a.y, 15, t * .85, "#a84a3d", "rgba(214,120,84,.95)", Math.cos(k) >= 0 ? 1 : -1);
        });
        add(.72, fxFog(7, 91, "rgba(255,255,255,.72)", .62, .88, { alpha: .46, w: 1.35 }));
        add(1.05, fxFog(4, 52, "rgba(255,255,255,.6)", .8, .98, { alpha: .46, w: 1.7 }));
      } },

    { key: "forest", title: "ป่าหมอกเงา", line: "ต้นไม้เก่าแก่สูงเสียดฟ้าบดบังดวงจันทร์ แสงทุกดวงในมือคุณดับลง",
      painting: "art/forest.webp",
      cam: { x: [0, .004], y: [.012, -.012], zoom: [1.0, 1.15] },
      build(add, map) {
        const moon = map.point(568, 75);
        add(.5, (c, t) => glow(c, moon.x, moon.y, VW * (.27 + Math.sin(t * .4) * .02), "rgba(190,235,255,.66)"));
        add(.5, fxRays(moon, "rgba(190,240,250,.22)", 7, { from: 1.42, to: 2.15, len: 1.15 }));
        add(.5, fxFog(5, 8, "rgba(165,235,232,.46)", .28, .54, { alpha: .22, w: 1.05 }));
        add(.5, fxFlicker(map, [[77, 605], [170, 682], [207, 715], [178, 738], [231, 742], [258, 742], [301, 781], [400, 846], [608, 846], [726, 828], [743, 806]], "rgba(100,255,225,.72)", 44, { speed: 1.1, depth: .5 }));
        add(.55, (c, t) => {
          // ดวงตาที่เฝ้ามองจากเงามืด
          const pulse = .5 + .5 * Math.sin(t * .55), blink = Math.sin(t * .27) > .94 ? 0 : 1;
          [[772, 962], [800, 960]].forEach(([x, y]) => {
            const p = map.point(x, y);
            glow(c, p.x, p.y, 13, "rgba(255,190,90,.9)", pulse * blink);
            c.fillStyle = `rgba(255,244,190,${pulse * blink})`; c.beginPath(); c.ellipse(p.x, p.y, 2.6, 1.5 * blink + .1, 0, 0, 7); c.fill();
          });
        });
        add(.68, fxMotes(30, 12, "rgba(110,255,230,.9)", { yMin: .22, yMax: .7, size: 7 }));
        add(.72, fxFog(5, 18, "rgba(120,215,218,.42)", .5, .72, { alpha: .3, w: 1.2 }));
        add(1.05, fxFog(5, 28, "rgba(90,170,175,.42)", .68, .95, { alpha: .5, w: 1.6 }));
      } },

    { key: "market", title: "ตลาดใต้แสงจันทร์", line: "โคมนับพันลอยขึ้นสู่แสงเหนือ แม่มดเฒ่าเล่าเรื่องที่คุณทำในป่าราวกับเห็นมาเอง",
      painting: "art/market.webp",
      cam: { x: [.004, -.004], y: [-.014, .012], zoom: [1.13, 1.0] },
      build(add, map) {
        const moon = map.point(678, 122);
        add(.5, fxAurora(map, [
          { color: "rgb(90,255,180)", x: -20, y: 40, w: 340, h: 370 },
          { color: "rgb(130,110,255)", x: 180, y: 20, w: 260, h: 340 },
          { color: "rgb(205,110,240)", x: 680, y: 80, w: 220, h: 300 },
        ]));
        add(.5, fxTwinkle(map, 34, 4, 0, 10, 864, 340));
        add(.5, (c, t) => glow(c, moon.x, moon.y, VW * (.38 + Math.sin(t * .4) * .02), "rgba(255,244,214,.5)"));
        add(.5, fxSkyLanterns(26, 22, .72, .03));
        add(.5, fxFalls(map, [{ x: 473, y0: 672, y1: 738, w: 14 }]));
        add(.5, fxFlicker(map, [
          [197, 690], [762, 755, 1.2], [597, 925], [548, 935], [495, 935], [358, 966], [425, 996], [473, 1006], [555, 1018], [593, 1015],
          [176, 1012, 1.2], [690, 1056, 1.1], [105, 1050], [133, 1012], [253, 885], [270, 1064], [625, 1042], [665, 1034],
        ], "rgba(255,172,76,.92)", 46, { speed: 3.6 }));
        add(.5, fxFlicker(map, [[15, 640], [90, 645], [840, 665], [388, 846], [210, 562], [70, 450]], "rgba(255,190,100,.5)", 54, { speed: 1.5, depth: .25 }));
        add(.72, fxMotes(22, 41, "rgba(255,200,120,.85)", { yMin: .42, yMax: .72, size: 5 }));
      } },

    { key: "lake", title: "หมู่บ้านริมทะเลสาบ", line: "รุ่งสางแรกแต้มยอดเขาเป็นสีชมพู ผืนน้ำนิ่งจนเป็นกระจกสะท้อนฟ้า",
      painting: "art/lake.webp",
      cam: { x: [-.006, .004], y: [.008, -.004], zoom: [1.1, 1.0] },
      build(add, map) {
        const sun = map.point(50, 293);
        add(.5, fxWater(map, 762, 1536));
        add(.5, fxRays(sun, "rgba(255,216,170,.22)", 9, { from: -.5, to: .75, len: 1.25 }));
        add(.5, (c, t) => glow(c, sun.x, sun.y, VW * (.3 + Math.sin(t * .5) * .02), "rgba(255,216,160,.62)"));
        add(.5, fxFalls(map, [{ x: 363, y0: 540, y1: 606, w: 16 }]));
        add(.5, fxSmoke(map, 628, 648));
        add(.5, fxFlicker(map, [[272, 800], [272, 858], [730, 720], [800, 720], [850, 722], [640, 715], [525, 722], [725, 625], [760, 625]], "rgba(255,186,96,.72)", 26, { speed: 2.4 }));
        add(.5, fxFlicker(map, [[700, 845], [790, 840], [640, 830], [540, 830]], "rgba(255,180,96,.42)", 30, { speed: 2 }));
        add(.5, fxWake(map, 170, 838));
        add(.5, fxBirds(10, 8, "rgba(74,50,84,.62)", .1, .28));
        add(.58, fxFog(4, 15, "rgba(255,232,220,.4)", .46, .5, { alpha: .13, w: .85 }));
        add(.76, fxMotes(9, 9, "rgba(255,226,175,.75)", { yMin: .38, yMax: .6, size: 5 }));
      } },

    { key: "city", title: "นครออเรเลน", line: "เมื่อม่านเมฆเปิดออก นครหินขาวก็ปรากฏ ม้วนคัมภีร์ในมือเริ่มเรืองแสง",
      painting: "art/city.webp",
      cam: { x: [0, 0], y: [.01, 0], zoom: [1.16, 1.0] },
      build(add, map) {
        const sun = map.point(800, 66);
        add(.5, fxFalls(map, [
          { x: 170, y0: 438, y1: 612, w: 62 }, { x: 225, y0: 642, y1: 790, w: 64 },
          { x: 423, y0: 696, y1: 880, w: 36 }, { x: 516, y0: 672, y1: 735, w: 34 },
          { x: 586, y0: 836, y1: 990, w: 42 }, { x: 657, y0: 700, y1: 770, w: 18 },
          { x: 758, y0: 850, y1: 978, w: 20 },
        ]));
        add(.5, (c, t) => glow(c, sun.x, sun.y, VW * (.42 + Math.sin(t * .5) * .03), "rgba(255,226,150,.62)"));
        add(.5, fxRays(sun, "rgba(255,226,165,.26)", 14, { from: 1.5, to: 3.5, len: 1.45 }));
        add(.42, fxFog(4, 62, "rgba(255,228,180,.5)", .62, .78, { alpha: .16, w: 1.1 }));
        add(.5, fxBirds(8, 16, "rgba(70,52,62,.6)", .08, .26));
        add(.5, (c, t) => {
          // มังกรแม่ลูกบินไกลลิบ ใช้สีเงาให้กลมกลืนกับภาพวาด
          const k = (t * .03) % 1, x = lerp(1.2, -.2, k) * VW, y = VH * (.13 + Math.sin(k * 7) * .018);
          drawDragon(c, x, y, 21, t * .55, "#4f3a45", "rgba(84,60,70,.9)", -1);
          drawDragon(c, x + 40, y + 13, 10, t * .9, "#5b434d", "rgba(102,74,82,.9)", -1);
        });
        add(.72, fxFog(5, 12, "rgba(255,232,190,.5)", .68, .9, { alpha: .22, w: 1.35 }));
        add(.76, fxMotes(16, 72, "rgba(255,226,148,.75)", { yMin: .36, yMax: .78, size: 5 }));
        add(1.05, fxPetals(40, 12));
      } },

    { key: "demon", title: "จอมมารกาฬไข้", line: "",
      painting: "art/demon.webp", veil: "#0a0507",
      cam: { x: [0, 0], y: [0, 0], zoom: [1.42, 1.0], focus: .14, dur: 15 },
      build(add, map) {
        add(.5, fxLightning(map, 780, 430));
        add(.5, fxFlicker(map, [[470, 400], [520, 500], [545, 560], [575, 615], [650, 700], [720, 770], [355, 330], [440, 720]], "rgba(255,90,30,.8)", 58, { speed: 1.5, depth: .55 }));
        add(.5, (c, t) => {
          // ดวงตาของจอมมาร ค่อย ๆ ลุกขึ้นแล้วเต้นตามจังหวะหายใจ
          const a = smooth(clamp(t / 3)) * (.65 + .35 * Math.sin(t * 1.3));
          [[468, 188], [497, 188]].forEach(([x, y]) => {
            const p = map.point(x, y);
            glow(c, p.x, p.y, 34, "rgba(255,60,30,.95)", a);
            glow(c, p.x, p.y, 8, "rgba(255,226,180,1)", a);
          });
        });
        add(.5, fxTwinkle(map, 4, 7, 590, 60, 620, 90));
        add(.5, fxFlicker(map, [[452, 1150, 1.5]], "rgba(255,216,110,.95)", 90, { speed: 2.2, depth: .3 }));
        add(.58, (c, t) => {
          // แม่มังกรพุ่งวนเข้าหามือของจอมมาร
          const k = (t * .11) % 1, x = lerp(-.3, 1.3, k) * VW, y = VH * (.5 + Math.sin(k * 6.3) * .05);
          drawDragon(c, x, y, 36, t * .7, "#2a1518", "rgba(150,54,40,.9)");
        });
        add(.72, fxEmbers(44, 18));
        add(.82, fxCreep(8, 33));
      } },
  ];

  // ---------- เครื่องเรนเดอร์ ----------
  const paintings = {};
  function loadPainting(scene) {
    if (paintings[scene.painting]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { paintings[scene.painting] = img; resolve(); };
      img.onerror = reject;
      img.src = scene.painting;
    });
  }

  // จัดภาพให้เต็มจอแบบ cover เผื่อขอบไว้เล็กน้อย และแปลงพิกัดบนภาพเป็นพิกัดบนจอ
  function paintingMap(scene) {
    const scale = Math.max((VW * 1.06) / IMG_W, (VH * 1.06) / IMG_H);
    const ox = VW / 2 - (IMG_W * scale) / 2, oy = VH * -.03;
    return {
      scale,
      point: (x, y) => ({ x: ox + x * scale, y: oy + y * scale }),
      image: () => paintings[scene.painting],
      draw: c => { if (paintings[scene.painting]) c.drawImage(paintings[scene.painting], ox, oy, IMG_W * scale, IMG_H * scale); },
    };
  }

  function buildScene(scene) {
    if (scene.stack) return;
    const stack = [], map = paintingMap(scene);
    stack.push({ depth: .5, fx: c => map.draw(c) });
    scene.build((depth, fx) => stack.push({ depth, fx }), map);
    scene.stack = stack;
  }

  function camera(scene, t) {
    const p = smooth(clamp(.5 - .5 * Math.cos((t / (scene.cam.dur || 26)) * Math.PI)));
    return { x: lerp(...scene.cam.x, p) * VW, y: lerp(...scene.cam.y, p) * VH, zoom: lerp(...scene.cam.zoom, p) };
  }

  const shake = { x: 0, y: 0, power: 0 };
  function drawScene(scene, t, extraZoom = 0) {
    buildScene(scene);
    const cam = camera(scene, t), zoom = cam.zoom + extraZoom;
    scene.stack.forEach(item => {
      const z = 1 + (zoom - 1) * lerp(.55, 1.3, item.depth);
      const focus = scene.cam.focus || .46;
      const tx = VW / 2 - (VW / 2) * z + cam.x * item.depth + shake.x, ty = VH * focus - VH * focus * z + cam.y * item.depth + shake.y;
      ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * tx, DPR * ty);
      item.fx(ctx, t);
    });
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  // ---------- สถานะและการเปลี่ยนฉาก ----------
  const TRANSITION = 2.2;
  let index = 0, sceneT = 0, last = 0, trans = null;

  function preload(i) {
    if (SCENES[i]) loadPainting(SCENES[i]).catch(() => {});
  }

  function swap() {
    index = trans.to; sceneT = 0; trans.swapped = true;
    trans.done();
  }

  // เปลี่ยนฉาก คืนค่าเมื่อถึงกลางม่าน ซึ่งเป็นจังหวะที่ฉากใหม่เริ่มปรากฏ
  function go(next) {
    return loadPainting(SCENES[next]).catch(() => {}).then(() => new Promise(resolve => {
      const mine = { to: next, t: 0, swapped: false, done: resolve };
      trans = mine;
      preload(next + 1);
      // เบราว์เซอร์หยุดวาดเมื่อแท็บถูกซ่อน จึงต้องกันไม่ให้เกมค้าง
      setTimeout(() => {
        if (trans !== mine) return;
        if (!mine.swapped) swap();
        trans = null;
      }, (TRANSITION + .6) * 1000);
    }));
  }

  function resize() {
    VW = innerWidth; VH = innerHeight;
    if (!VW || !VH) return; // แท็บที่ถูกซ่อนอาจรายงานขนาดเป็นศูนย์ ไว้สร้างฉากตอนกลับมาแสดง
    view.width = Math.round(VW * DPR); view.height = Math.round(VH * DPR);
    SCENES.forEach(s => { delete s.stack; });
    buildScene(SCENES[index]);
  }

  function frame(now) {
    if (!VW || !VH) { resize(); requestAnimationFrame(frame); return; }
    const dt = QUIET ? 0 : Math.min((now - last) / 1000 || 0, .05);
    last = now;
    sceneT += dt;
    shake.power = Math.max(0, shake.power - dt * 1.4);
    shake.x = (Math.random() - .5) * shake.power * 18;
    shake.y = (Math.random() - .5) * shake.power * 18;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (trans) {
      trans.t += QUIET ? 1 : dt;
      const k = trans.t / TRANSITION, color = SCENES[trans.to].veil;
      if (k < .5) {
        drawScene(SCENES[index], sceneT, smooth(k * 2) * .85);
        veil(smooth(k * 2), now, color);
      } else {
        if (!trans.swapped) swap();
        drawScene(SCENES[index], sceneT, (1 - smooth(clamp((k - .5) * 2))) * .4);
        veil(1 - smooth(clamp((k - .5) * 2)), now, color);
        if (k >= 1) trans = null;
      }
    } else {
      drawScene(SCENES[index], sceneT);
    }
    requestAnimationFrame(frame);
  }

  // ม่านระหว่างเปลี่ยนฉาก เหมือนกล้องบินทะลุเมฆ หรือถูกควันดำกลืนในฉากจอมมาร
  function veil(a, now, color) {
    ctx.globalAlpha = a;
    ctx.fillStyle = color || "#fff8ec"; ctx.fillRect(0, 0, VW, VH);
    if (!color) {
      const spr = fogSprite("rgba(255,255,255,.8)");
      ctx.globalAlpha = clamp(a * 1.6);
      for (let i = 0; i < 6; i++) {
        const w = VW * (1.2 + i * .35), x = VW * .5 + Math.sin(i * 2.1 + now * .0004) * VW * .35 - w / 2, y = VH * (i / 6) - w * .2;
        ctx.drawImage(spr, x, y, w, w * .4);
      }
    }
    ctx.globalAlpha = 1;
  }

  let resizeTimer;
  addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 200); });

  window.Scenes = {
    start(i = 0) {
      index = i;
      return loadPainting(SCENES[i]).catch(() => {}).then(() => {
        preload(i + 1);
        resize();
        requestAnimationFrame(frame);
      });
    },
    go,
    shake() { if (!QUIET) shake.power = 1; },
  };
})();

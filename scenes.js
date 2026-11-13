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
    { key: "ceremony", title: "ลานพระราชวังอโยธยา", line: "",
      painting: "art/scenes/ceremony.webp",
      cam: { x: [0, 0], y: [.01, 0], zoom: [1.14, 1.0] },
      build(add, map) {
        const sun = map.point(472, 630);
        add(.5, (c, t) => glow(c, sun.x, sun.y, VW * (.32 + Math.sin(t * .5) * .025), "rgba(255,214,150,.6)"));
        add(.5, fxRays(sun, "rgba(255,220,160,.24)", 10, { from: 3.6, to: 5.8, len: 1.1 }));
        add(.5, fxFlicker(map, [[276, 410], [588, 410], [60, 640], [136, 660], [212, 660], [652, 660], [724, 660], [800, 640]], "rgba(255,190,90,.9)", 34));
        add(.5, fxTwinkle(map, 12, 21, 20, 820, 840, 880));
        add(.62, fxMotes(16, 8, "rgba(255,224,150,.8)", { yMin: .25, yMax: .6, size: 6 }));
        add(.9, fxPetals(30, 6, ["#ffc7d8", "#ffe0e8", "#ffd27a"]));
      } },

    { key: "bridge", title: "ช่องเขาเหนือทะเลเมฆ", line: "",
      painting: "art/scenes/bridge.webp",
      cam: { x: [0, 0], y: [-.02, .01], zoom: [1.0, 1.12] },
      build(add, map) {
        add(.5, fxFalls(map, [{ x: 120, y0: 640, y1: 980, w: 30 }, { x: 750, y0: 640, y1: 980, w: 30 }]));
        add(.5, fxBirds(7, 3, "rgba(46,62,90,.55)", .06, .22));
        add(.5, fxTwinkle(map, 8, 5, 0, 300, 864, 560));
        add(.6, fxFog(6, 22, "rgba(255,255,255,.7)", .62, .8, { alpha: .45, w: 1.2 }));
        add(1.05, fxFog(4, 52, "rgba(255,255,255,.6)", .78, .92, { alpha: .5, w: 1.6 }));
        add(.9, fxPetals(14, 9, ["#ffffff", "#ffe6ef", "#fff2c2"], { speed: .7 }));
      } },

    { key: "forest", title: "ป่าทัณฑกะ", line: "",
      painting: "art/scenes/forest.webp",
      cam: { x: [0, .004], y: [.012, -.012], zoom: [1.0, 1.15] },
      build(add, map) {
        const moon = map.point(144, 20);
        add(.5, (c, t) => glow(c, moon.x, moon.y, VW * (.25 + Math.sin(t * .4) * .02), "rgba(190,235,255,.6)"));
        add(.5, fxRays(moon, "rgba(190,240,250,.2)", 6, { from: .7, to: 1.3, len: 1.2 }));
        add(.5, fxFlicker(map, [[50, 740], [140, 790], [230, 800], [260, 590], [500, 810], [536, 730], [410, 930], [660, 930], [820, 800]], "rgba(100,255,225,.72)", 48, { speed: 1.1, depth: .5 }));
        add(.5, (c, t) => {
          // ดวงตาในโพรงไม้ ลืมช้า ๆ แล้วกะพริบ
          const pulse = .55 + .45 * Math.sin(t * .55), blink = Math.sin(t * .27) > .94 ? 0 : 1;
          [[430, 414], [458, 414]].forEach(([x, y]) => {
            const p = map.point(x, y);
            glow(c, p.x, p.y, 16, "rgba(255,170,70,.95)", pulse * blink);
          });
        });
        add(.68, fxMotes(30, 12, "rgba(110,255,230,.9)", { yMin: .2, yMax: .62, size: 7 }));
        add(1.05, fxFog(5, 28, "rgba(90,170,175,.4)", .66, .92, { alpha: .45, w: 1.6 }));
      } },

    { key: "market", title: "นครวานรยามค่ำ", line: "",
      painting: "art/scenes/market.webp",
      cam: { x: [.004, -.004], y: [-.014, .012], zoom: [1.13, 1.0] },
      build(add, map) {
        const moon = map.point(700, 120);
        add(.5, fxTwinkle(map, 30, 4, 250, 10, 864, 300));
        add(.5, (c, t) => glow(c, moon.x, moon.y, VW * (.34 + Math.sin(t * .4) * .02), "rgba(255,244,200,.5)"));
        add(.5, fxSkyLanterns(22, 22, .62, .03));
        add(.5, fxFlicker(map, [
          [36, 330], [340, 360], [300, 660], [560, 600], [750, 710], [830, 680], [740, 420], [200, 480], [480, 840], [680, 870], [600, 960],
        ], "rgba(255,172,76,.92)", 46, { speed: 3.4 }));
        add(.72, fxMotes(18, 41, "rgba(255,200,120,.8)", { yMin: .4, yMax: .66, size: 5 }));
      } },

    { key: "lake", title: "ฝั่งทะเลก่อนข้ามสู่ลังกา", line: "",
      painting: "art/scenes/lake.webp",
      cam: { x: [-.006, .004], y: [.008, -.004], zoom: [1.1, 1.0] },
      build(add, map) {
        add(.5, fxWater(map, 760, 1536));
        add(.5, fxFlicker(map, [[330, 624]], "rgba(255,190,100,.85)", 34, { speed: 2.4 }));
        add(.5, fxTwinkle(map, 16, 9, 200, 560, 700, 1100));
        add(.5, fxBirds(9, 8, "rgba(74,50,84,.55)", .06, .22));
        add(.58, fxFog(5, 15, "rgba(255,232,220,.5)", .4, .5, { alpha: .2, w: 1 }));
        add(.9, fxPetals(10, 31, ["#ffc7d8", "#ffe0e8"], { speed: .6 }));
      } },

    { key: "city", title: "นครโอสถบนเขาสัญชีวนี", line: "",
      painting: "art/scenes/city.webp",
      cam: { x: [0, 0], y: [.01, 0], zoom: [1.16, 1.0] },
      build(add, map) {
        const spring = map.point(440, 500);
        add(.5, fxTwinkle(map, 26, 7, 0, 0, 864, 520));
        add(.5, (c, t) => glow(c, spring.x, spring.y, VW * (.3 + Math.sin(t * 1.1) * .04), "rgba(255,226,140,.7)"));
        add(.5, fxFlicker(map, [[196, 704], [628, 556], [712, 640], [276, 536]], "rgba(255,120,200,.7)", 56, { speed: 1.4, depth: .45 }));
        add(.5, fxFlicker(map, [[314, 780], [630, 556]], "rgba(110,230,255,.75)", 56, { speed: 1.2, depth: .45 }));
        add(.5, fxFlicker(map, [[136, 596], [160, 640], [174, 890], [750, 740], [764, 784]], "rgba(255,220,110,.85)", 36, { speed: 2.2 }));
        add(.5, fxFlicker(map, [[240, 590], [396, 736], [640, 644], [736, 904], [270, 930]], "rgba(190,140,255,.7)", 40, { speed: 1.6, depth: .45 }));
        add(.72, fxMotes(26, 72, "rgba(170,255,210,.85)", { yMin: .2, yMax: .62, size: 6 }));
        add(1.05, fxPetals(20, 12, ["#ffd1f0", "#c9f5ff", "#fff2a8"], { speed: .6 }));
      } },

    { key: "demon", title: "ราชาอสูรทศเศียร", line: "",
      painting: "art/scenes/demon.webp", veil: "#0a0507",
      cam: { x: [0, 0], y: [0, 0], zoom: [1.42, 1.0], focus: .2, dur: 15 },
      build(add, map) {
        add(.5, fxLightning(map, 700, 200));
        add(.5, fxFlicker(map, [[60, 880], [800, 880], [430, 860], [200, 1000], [660, 1000], [100, 1060], [760, 1060]], "rgba(255,110,40,.85)", 70, { speed: 1.8, depth: .5 }));
        add(.5, (c, t) => {
          // ดวงตาของศีรษะกลาง ค่อย ๆ ลุกขึ้นแล้วเต้นตามจังหวะหายใจ
          const a = smooth(clamp(t / 3)) * (.65 + .35 * Math.sin(t * 1.3));
          [[400, 340], [464, 340]].forEach(([x, y]) => {
            const p = map.point(x, y);
            glow(c, p.x, p.y, 30, "rgba(255,80,30,.95)", a);
          });
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

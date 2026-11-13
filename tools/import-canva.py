# นำเข้าภาพการ์ดที่ดาวน์โหลดจาก Canva แล้ววางไว้ใน art/cards (หรือไฟล์ zip ในโฟลเดอร์นั้น)
# ใช้งาน: python tools/import-canva.py
import json, os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get("PYLIB", ""))
from PIL import Image

inbox = os.path.join(ROOT, "art", "cards")
src_dir = os.path.join(ROOT, "art", "source", "cards")
os.makedirs(src_dir, exist_ok=True)
mapping = json.load(open(os.path.join(ROOT, "tools", "canva-map.json"), encoding="utf-8"))

for f in os.listdir(inbox):
    if f.lower().endswith(".zip"):
        with zipfile.ZipFile(os.path.join(inbox, f)) as z:
            z.extractall(src_dir)
for f in os.listdir(inbox):
    if f.lower().endswith((".png", ".jpg", ".jpeg")):
        os.replace(os.path.join(inbox, f), os.path.join(src_dir, f))

found = {}
for dirpath, _, files in os.walk(src_dir):
    for f in files:
        if not f.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        for group in ("common", "rare", "speakers"):
            for prefix, sid in mapping[group].items():
                if f.startswith(prefix):
                    found[(group, sid)] = os.path.join(dirpath, f)

for (group, sid), path in sorted(found.items()):
    im = Image.open(path).convert("RGB")
    if group == "speakers":
        out = os.path.join(ROOT, "art", "characters", sid + ".webp")
        im = im.resize((320, 320), Image.LANCZOS)
    else:
        out = os.path.join(inbox, sid + ("-rare" if group == "rare" else "") + ".webp")
        im = im.resize((768, 1152), Image.LANCZOS)
    im.save(out, quality=82, method=6)

# ชี้ data.js ไปที่ภาพใหม่ของสาขาที่มีไฟล์แล้ว
p = os.path.join(ROOT, "data.js")
s = open(p, encoding="utf-8").read()
for (group, sid) in found:
    if group == "common":
        s = s.replace(f'hero: "art/characters/{sid}.webp"', f'hero: "art/cards/{sid}.webp"')
    if group == "rare":
        s = re.sub(rf'(\{{ id: "{sid}",.*?heroRare: )"[^"]*"', rf'\1"art/cards/{sid}-rare.webp"', s, count=1, flags=re.S)
open(p, "w", encoding="utf-8").write(s)

for group in ("common", "rare", "speakers"):
    have = sorted(sid for (g, sid) in found if g == group)
    missing = sorted(set(mapping[group].values()) - set(have))
    print(f"{group}: {len(have)} ภาพ" + (f" | ยังไม่มี: {', '.join(missing)}" if missing else ""))

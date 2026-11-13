# เปลี่ยนเลขเวอร์ชันทุกจุดพร้อมกัน ทุกครั้งที่แก้ไฟล์เกมแล้วจะอัปขึ้นเว็บ
# ใช้งาน: python tools/bump-version.py
import os, re, time
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
new = time.strftime("%Y%m%d%H%M")
for name in ("index.html", "admin.html"):
    p = os.path.join(root, name)
    s = open(p, encoding="utf-8").read()
    s = re.sub(r"\?v=\d+[a-z]?", "?v=" + new, s)
    s = re.sub(r'var mine = "[^"]*"', f'var mine = "{new}"', s)
    open(p, "w", encoding="utf-8").write(s)
open(os.path.join(root, "version.txt"), "w").write(new)
print("version", new)

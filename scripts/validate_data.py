"""Проверяет все public/data/*.json на формат DataSeries (раздел 9) и weather_* кэши. Запуск: .venv/bin/python scripts/validate_data.py"""
import json
import sys

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import DATA_DIR, file_name, validate_series  # noqa: E402

bad = 0
n = 0
for p in sorted(DATA_DIR.glob("*.json")):
    d = json.loads(p.read_text(encoding="utf-8"))
    if p.name == "index.json":
        for f in d["files"]:
            if not (DATA_DIR / f["file"]).exists():
                print("index: нет файла", f["file"]); bad += 1
        continue
    if p.name.startswith("weather_"):
        if not d.get("days") or not {"date", "tMin", "tMax", "tMean", "precipitation"} <= set(d["days"][0]):
            print(p.name, "неверный формат кэша"); bad += 1
        continue
    n += 1
    errs = validate_series(d)
    if not errs and file_name(d["indicator"], d["region"], d["crop"], d["frequency"]) != p.name:
        errs.append("имя файла не соответствует содержимому")
    # реальные ряды не должны быть помечены как демо, демо — должны быть явно названы демо в source
    if not errs and d["demo"] is False and "демо" in d["source"].lower():
        errs.append("demo: false, но в source есть пометка «демо»")
    if not errs and d["demo"] is True and "демо" not in d["source"].lower():
        errs.append("demo: true, но в source нет пометки «демо»")
    if errs:
        bad += 1
        print(p.name, errs)

# --- Календарь сезона в src/config/regions.ts: sowing/growing/harvest не пересекаются, sales не длиннее 150 дней
import re
from datetime import date, timedelta
from common import ROOT


def days_of(a, b):
    d0 = date(2001, int(a[:2]), int(a[3:]))
    d1 = date(2001, int(b[:2]), int(b[3:]))
    if d1 < d0:  # переход через Новый год
        d1 = date(2002, d1.month, d1.day)
    return {(d0 + timedelta(days=i)).strftime("%m-%d") for i in range((d1 - d0).days + 1)}


txt = (ROOT / "src" / "config" / "regions.ts").read_text(encoding="utf-8")
ids = [(m.start(), m.group(1)) for m in re.finditer(r"id: '(\w+)',\s*name:", txt)]
for m in re.finditer(r"(\w+): phases\(((?:\s*\['\d\d-\d\d', '\d\d-\d\d'\],?)+)\s*\)", txt):
    region = [r for pos, r in ids if pos < m.start()][-1]
    ranges = re.findall(r"\['(\d\d-\d\d)', '(\d\d-\d\d)'\]", m.group(2))
    sets = [days_of(a, b) for a, b in ranges]
    names = ["sowing", "growing", "harvest", "sales"]
    for i in range(3):
        for j in range(i + 1, 3):
            if sets[i] & sets[j]:
                print("сезон", region, m.group(1), names[i], "пересекается с", names[j]); bad += 1
    if len(sets[3]) > 150:
        print("сезон", region, m.group(1), "sales длиннее 150 дней:", len(sets[3])); bad += 1

print("проверено рядов:", n, "ошибок:", bad)
sys.exit(1 if bad else 0)

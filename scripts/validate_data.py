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
    if errs:
        bad += 1
        print(p.name, errs)
print("проверено рядов:", n, "ошибок:", bad)
sys.exit(1 if bad else 0)

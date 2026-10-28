"""Общие утилиты скриптов данных: запись DataSeries, имена файлов, манифест, валидация.

Формат ряда (раздел 9 CLAUDE.md / src/types.ts):
{indicator, region, crop, unit, source, source_url, updated_at, frequency, demo, series: [{date, value}], note?}
"""
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data"
RAW_DIR = ROOT / "raw"

INDICATORS = {
    "producer_price", "diesel_price", "yield", "gross_harvest", "sown_area", "key_rate",
    "temperature_mean", "temperature_min", "temperature_max", "precipitation", "active_temp_sum", "dry_days",
}
FREQUENCIES = {"day", "week", "month", "year", "event"}
UNITS = {"руб./т", "руб./л", "ц/га", "тыс. т", "тыс. га", "%", "°C", "мм", "дни"}
CROPS = {"wheat", "barley", "sunflower", "corn"}
REQUIRED = ["indicator", "region", "crop", "unit", "source", "source_url", "updated_at", "frequency", "demo", "series"]


def file_name(indicator, region, crop, frequency):
    """Имя файла как seriesFileName в src/lib/data.ts."""
    return "{}_{}{}_{}.json".format(indicator, region, "_" + crop if crop else "", frequency)


def make_series(indicator, region, crop, unit, source, source_url, updated_at, frequency, demo, points, note=None):
    d = {
        "indicator": indicator, "region": region, "crop": crop, "unit": unit,
        "source": source, "source_url": source_url, "updated_at": updated_at,
        "frequency": frequency, "demo": demo,
        "series": [{"date": d_, "value": v} for d_, v in points],
    }
    if note:
        d["note"] = note
    return d


def write_series(d, data_dir=None):
    data_dir = Path(data_dir) if data_dir else DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    name = file_name(d["indicator"], d["region"], d["crop"], d["frequency"])
    with open(data_dir / name, "w", encoding="utf-8") as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return name


def validate_series(d):
    """Возвращает список ошибок формата (пустой — ряд корректен)."""
    errs = []
    for k in REQUIRED:
        if k not in d:
            errs.append("нет поля " + k)
    if errs:
        return errs
    if d["indicator"] not in INDICATORS: errs.append("indicator: " + str(d["indicator"]))
    if d["frequency"] not in FREQUENCIES: errs.append("frequency: " + str(d["frequency"]))
    if d["unit"] not in UNITS: errs.append("unit: " + str(d["unit"]))
    if d["crop"] is not None and d["crop"] not in CROPS: errs.append("crop: " + str(d["crop"]))
    if not isinstance(d["demo"], bool): errs.append("demo не bool")
    if not isinstance(d["series"], list) or not d["series"]: errs.append("series пуст")
    else:
        prev = ""
        for p in d["series"]:
            dt = p.get("date", "")
            if len(dt) != 10 or dt[4] != "-" or dt[7] != "-": errs.append("дата: " + str(dt)); break
            if dt <= prev: errs.append("даты не по возрастанию: " + dt); break
            prev = dt
            v = p.get("value")
            if v is not None and not isinstance(v, (int, float)): errs.append("value: " + str(v)); break
    return errs


def build_manifest(data_dir=None):
    """public/data/index.json по всем рядам-DataSeries в каталоге (кэши погоды weather_* не включаются)."""
    data_dir = Path(data_dir) if data_dir else DATA_DIR
    files = []
    for p in sorted(data_dir.glob("*.json")):
        if p.name == "index.json" or p.name.startswith("weather_"):
            continue
        d = json.loads(p.read_text(encoding="utf-8"))
        if validate_series(d):
            continue
        files.append({
            "indicator": d["indicator"], "region": d["region"], "crop": d["crop"], "frequency": d["frequency"],
            "file": p.name, "demo": d["demo"], "source": d["source"], "updated_at": d["updated_at"],
        })
    m = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "files": files}
    with open(data_dir / "index.json", "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1)
        f.write("\n")
    return m

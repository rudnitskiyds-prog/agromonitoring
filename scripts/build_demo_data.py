"""Демо-ряды для public/data (формат DataSeries, demo=true). Детерминированно (seed фиксирован).

Это НЕ статистика: ряды синтетические, с правдоподобными уровнями и сезонностью.
Реальные выгрузки Росстата/ЕМИСС кладутся в raw/ и разбираются scripts/parse_rosstat.py.
Запуск: .venv/bin/python scripts/build_demo_data.py
Затем пересобирается index.json.
"""
import json
import math
import random
import sys
from datetime import date, timedelta

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import DATA_DIR, build_manifest, file_name, make_series, validate_series, write_series  # noqa: E402

SEED = 20261028
REGIONS = ["krasnodar", "saratov"]
CROPS = ["wheat", "barley", "sunflower", "corn"]
TODAY = date(2026, 10, 28)
UPD_MONTH, UPD_WEEK, UPD_YEAR = "2026-10-01", "2026-10-26", "2026-10-15"
ROSSTAT = "Росстат / ЕМИСС (демо-ряд)"
FEDSTAT = "https://www.fedstat.ru/"


def rng(*parts):
    return random.Random("{}|{}".format(SEED, "|".join(str(p) for p in parts)))


# ── 1. Цены производителей, руб./т, помесячно 2020-11 … 2026-10 ───────────────
# Уровень октября 2026 (допущение для демо), руб./т
PRICE_BASE = {
    ("krasnodar", "wheat"): 16200, ("saratov", "wheat"): 14600,
    ("krasnodar", "barley"): 13900, ("saratov", "barley"): 12400,
    ("krasnodar", "sunflower"): 39500, ("saratov", "sunflower"): 37200,
    ("krasnodar", "corn"): 14800, ("saratov", "corn"): 13600,
}
# Сезонный индекс по месяцам янв..дек (относительно среднего): провал в уборку, рост к весне
SEASON = {
    "wheat":     [1.04, 1.05, 1.06, 1.07, 1.08, 1.07, 0.95, 0.92, 0.95, 0.98, 1.00, 1.02],
    "barley":    [1.04, 1.05, 1.06, 1.07, 1.07, 1.05, 0.94, 0.92, 0.95, 0.98, 1.00, 1.02],
    "sunflower": [1.05, 1.06, 1.07, 1.07, 1.06, 1.05, 1.03, 1.00, 0.94, 0.92, 0.95, 1.00],
    "corn":      [1.04, 1.05, 1.06, 1.07, 1.07, 1.06, 1.03, 1.00, 0.96, 0.93, 0.94, 0.98],
}


def months(start, end):
    y, m = start
    while (y, m) <= end:
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def build_prices():
    out = []
    for region in REGIONS:
        for crop in CROPS:
            r = rng("price", region, crop)
            base = PRICE_BASE[(region, crop)]
            ms = list(months((2020, 11), (2026, 10)))
            n = len(ms)
            noise = 0.0
            pts = []
            for i, (y, m) in enumerate(ms):
                t = i / (n - 1)
                trend = 0.60 + 0.40 * t ** 1.15          # рост с 2020 к 2026 с ускорением
                trend *= 1 + 0.06 * math.sin(2 * math.pi * (t * 1.5))  # длинная волна
                noise = 0.6 * noise + r.gauss(0, 0.012)  # автокоррелированный шум
                v = base * trend * SEASON[crop][m - 1] * (1 + noise)
                if (y, m) in ((2026, 9), (2026, 10)):
                    v *= 1.03                              # текущий месяц чуть выше нормы (сценарий С2)
                pts.append(("{}-{:02d}-01".format(y, m), round(v / 10) * 10))
            out.append(make_series(
                "producer_price", region, crop, "руб./т", ROSSTAT, FEDSTAT, UPD_MONTH, "month", True, pts,
                note="Демо-ряд: уровень × тренд × сезонный индекс (провал в уборку, рост к весне) + шум; не статистика Росстата."))
    return out


# ── 2. Дизель, руб./л, понедельно, 104 недели ────────────────────────────────
def build_diesel():
    out = []
    last = date(2026, 10, 26)
    weeks = [last - timedelta(weeks=103 - i) for i in range(104)]
    for region, shift in (("krasnodar", 0.0), ("saratov", -1.4)):
        r = rng("diesel", region)
        noise, pts = 0.0, []
        for i, d in enumerate(weeks):
            t = i / 103
            v = 59.0 + 6.5 * t + 3.0 * t ** 2                 # плавный рост
            if i >= 96:
                v += (i - 95) * 0.45 * (1 + (i - 96) * 0.15)  # ускорение в последние недели
            noise = 0.7 * noise + r.gauss(0, 0.12)
            pts.append((d.isoformat(), round(v + shift + noise, 2)))
        out.append(make_series(
            "diesel_price", region, None, "руб./л", "Росстат, мониторинг цен на нефтепродукты (демо-ряд)",
            "https://rosstat.gov.ru/statistics/price", UPD_WEEK, "week", True, pts,
            note="Демо-ряд: плавный рост с ускорением в последние недели + шум; не статистика Росстата."))
    return out


# ── 3–5. Урожайность, посевная площадь, валовой сбор по годам 2019–2026 ──────
YEARS = list(range(2019, 2027))
YIELD_BASE = {  # ц/га, средний уровень
    "krasnodar": {"wheat": 51.0, "barley": 41.0, "sunflower": 25.0, "corn": 54.0},
    "saratov": {"wheat": 18.5, "barley": 15.5, "sunflower": 13.5, "corn": 38.0},
    "russia": {"wheat": 29.0, "barley": 26.0, "sunflower": 17.0, "corn": 50.0},
}
# Фиксированные факторы по годам для регионов (общая погодная волна + шум)
WAVE = {2019: 0.97, 2020: 0.88, 2021: 1.03, 2022: 1.12, 2023: 0.94, 2024: 0.90, 2025: 1.06, 2026: 0.99}
AREA_BASE = {  # тыс. га
    "krasnodar": {"wheat": 1650, "barley": 260, "sunflower": 480, "corn": 340},
    "saratov": {"wheat": 1250, "barley": 330, "sunflower": 900, "corn": 45},
}


def build_yield_area_harvest():
    yields, areas, harvests = {}, {}, {}
    out = []
    for scope in REGIONS + ["russia"]:
        for crop in CROPS:
            r = rng("yield", scope, crop)
            vals = {}
            for y in YEARS:
                regional = 1 + (WAVE[y] - 1) * (1.5 if scope == "saratov" else 1.0 if scope == "krasnodar" else 0.5)
                v = YIELD_BASE[scope][crop] * regional * (1 + r.gauss(0, 0.03))
                vals[y] = v
            if scope == "saratov" and crop == "wheat":      # С3: 2026 заметно хуже 2025 (засуха мая–июня)
                vals[2025] = YIELD_BASE[scope][crop] * 1.12
                vals[2026] = vals[2025] * 0.70
            if scope == "krasnodar" and crop == "wheat":    # умеренно хуже
                vals[2025] = YIELD_BASE[scope][crop] * 1.06
                vals[2026] = vals[2025] * 0.93
            vals = {y: round(v, 1) for y, v in vals.items()}
            yields[(scope, crop)] = vals
            pts = [("{}-01-01".format(y), vals[y]) for y in YEARS]
            out.append(make_series(
                "yield", scope, crop, "ц/га", ROSSTAT, FEDSTAT, UPD_YEAR, "year", True, pts,
                note="Демо-ряд: средний уровень × погодная волна лет + шум; 2026 — предварительная оценка. Не статистика Росстата."))
    for region in REGIONS:
        for crop in CROPS:
            r = rng("area", region, crop)
            apts, hpts = [], []
            for y in YEARS:
                area = AREA_BASE[region][crop] * (1 + 0.012 * (y - 2019)) * (1 + r.gauss(0, 0.02))
                area = round(area, 1)
                gross = round(area * yields[(region, crop)][y] / 10, 1)   # тыс. га × ц/га / 10 = тыс. т
                apts.append(("{}-01-01".format(y), area))
                hpts.append(("{}-01-01".format(y), gross))
            out.append(make_series(
                "sown_area", region, crop, "тыс. га", ROSSTAT, FEDSTAT, UPD_YEAR, "year", True, apts,
                note="Демо-ряд: базовая площадь с медленным ростом и шумом. Не статистика Росстата."))
            out.append(make_series(
                "gross_harvest", region, crop, "тыс. т", ROSSTAT, FEDSTAT, UPD_YEAR, "year", True, hpts,
                note="Демо-ряд: валовой сбор = посевная площадь × урожайность / 10 (согласован с рядами sown_area и yield)."))
    return out


def main():
    all_series = build_prices() + build_diesel() + build_yield_area_harvest()
    for d in all_series:
        errs = validate_series(d)
        if errs:
            raise SystemExit("Ошибка формата {}: {}".format(d["indicator"], errs))
        existing = DATA_DIR / file_name(d["indicator"], d["region"], d["crop"], d["frequency"])
        if existing.exists() and json.loads(existing.read_text(encoding="utf-8")).get("demo") is False:
            print("пропуск (там реальные данные):", existing.name)
            continue
        write_series(d)
    m = build_manifest()
    print("Демо-рядов: {}; в манифесте: {}".format(len(all_series), len(m["files"])))


if __name__ == "__main__":
    main()

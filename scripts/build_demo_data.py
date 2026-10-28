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


def seasonal_norms(pts):
    """Норма месяца как в src/lib/seasonality.ts: индекс (цена / среднегодовая) по последним 5 полным годам
    × средняя цена за последние 12 месяцев. Возвращает {месяц: норма}."""
    by = {d[:7]: v for d, v in pts}
    years = sorted({int(k[:4]) for k in by})
    full = [y for y in years if all("{}-{:02d}".format(y, m) in by for m in range(1, 13))][-5:]
    last12 = [v for _, v in pts][-12:]
    base = sum(last12) / len(last12)
    norms = {}
    for m in range(1, 13):
        idx = []
        for y in full:
            avg = sum(by["{}-{:02d}".format(y, k)] for k in range(1, 13)) / 12
            idx.append(by["{}-{:02d}".format(y, m)] / avg)
        norms[m] = sum(idx) / len(idx) * base
    return norms


def calibrate_to_norm(pts, target_dev_pct):
    """Подбирает цены последних месяцев 2026 так, чтобы отклонение от сезонной нормы было заданным (%).
    Профиль 2021–2025 не меняется: правятся только точки 2026-09 и 2026-10."""
    pts = list(pts)
    idx = {int(d[5:7]): i for i, (d, _) in enumerate(pts) if d.startswith("2026-")}
    for _ in range(200):
        norms = seasonal_norms(pts)
        for m, dev in target_dev_pct.items():
            pts[idx[m]] = (pts[idx[m]][0], norms[m] * (1 + dev / 100))
    return [(d, round(v / 10) * 10) for d, v in pts]


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
                if (y, m) in ((2026, 9), (2026, 10)) and not (region, crop) == ("krasnodar", "wheat"):
                    v *= 1.03                              # текущий месяц чуть выше нормы
                pts.append(("{}-{:02d}-01".format(y, m), round(v / 10) * 10))
            if (region, crop) == ("krasnodar", "wheat"):
                pts = calibrate_to_norm(pts, {9: 3.0, 10: 6.0})  # сценарий С2: октябрь на 6% выше нормы
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


# Изменение урожайности 2026 к 2025 (множитель) подобрано по реальной погоде ERA5 (public/data/precipitation_*, dry_days_*,
# active_temp_sum_*, temperature_mean_*), а не наугад: см. YIELD_NOTE. Сам ряд урожайности остаётся демо.
YIELD_2026_VS_2025 = {
    ("krasnodar", "wheat"): 0.92, ("krasnodar", "barley"): 0.94, ("krasnodar", "sunflower"): 0.90, ("krasnodar", "corn"): 0.88,
    ("saratov", "wheat"): 0.97, ("saratov", "barley"): 0.95, ("saratov", "sunflower"): 0.78, ("saratov", "corn"): 0.80,
    ("russia", "wheat"): 0.97, ("russia", "barley"): 0.97, ("russia", "sunflower"): 0.95, ("russia", "corn"): 0.95,
}
_KR_WX = ("Падение 2026 к 2025 согласовано с реальной погодой ERA5: в мае осадков 228 мм при норме 88 мм (избыток влаги), "
          "лето прохладнее нормы (сумма активных температур апр–сен на 10% ниже).")
_SAR_DRY = ("Падение 2026 к 2025 согласовано с реальной погодой ERA5 (Саратов, осадки к норме 2019–2025): "
            "июль 28 мм при норме 34 мм (−16%), август 12 мм при норме 34 мм (−65%), сентябрь 36 мм при норме 27 мм (+36%, влажнее нормы). "
            "Октябрь 2026 неполный (данные до 27.10), с полными октябрями не сравнивается.")
YIELD_NOTE = {
    ("krasnodar", "wheat"): _KR_WX, ("krasnodar", "barley"): _KR_WX,
    ("krasnodar", "sunflower"): _KR_WX + " Для подсолнечника добавляет риск сухой август (35 мм при норме 55 мм).",
    ("krasnodar", "corn"): _KR_WX + " Для кукурузы критичен недобор тепла.",
    ("saratov", "wheat"): "Умеренное снижение: влажные май–июнь (152 мм при норме 92 мм) для пшеницы благоприятны, "
                          "погода сильного падения НЕ объясняет; небольшая просадка отнесена на сухой март (12 мм при норме 39 мм).",
    ("saratov", "barley"): "Умеренное снижение: июнь влажный, июль суховат (28 мм при норме 34 мм); погода объясняет его слабо.",
    ("saratov", "sunflower"): _SAR_DRY, ("saratov", "corn"): _SAR_DRY,
    ("russia", "wheat"): "Среднее по РФ: небольшое снижение, погодой РФ не обосновано (демо).",
    ("russia", "barley"): "Среднее по РФ: небольшое снижение, погодой РФ не обосновано (демо).",
    ("russia", "sunflower"): "Среднее по РФ: небольшое снижение, погодой РФ не обосновано (демо).",
    ("russia", "corn"): "Среднее по РФ: небольшое снижение, погодой РФ не обосновано (демо).",
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
            vals[2026] = vals[2025] * YIELD_2026_VS_2025[(scope, crop)]
            vals = {y: round(v, 1) for y, v in vals.items()}
            yields[(scope, crop)] = vals
            pts = [("{}-01-01".format(y), vals[y]) for y in YEARS]
            out.append(make_series(
                "yield", scope, crop, "ц/га", ROSSTAT, FEDSTAT, UPD_YEAR, "year", True, pts,
                note="Демо-ряд: средний уровень × погодная волна лет + шум; 2026 — предварительная оценка. "
                     + YIELD_NOTE[(scope, crop)] + " Не статистика Росстата."))
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

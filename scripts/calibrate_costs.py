"""Калибровка затрат по умолчанию (defaultCosts в src/config/regions.ts) по официальной статистике Росстата.

Метод (база 2024 г., инфляция к 2026 г. НЕ добавляется):
 1. Себестоимость тонны = средняя за 2024 г. реальная цена производителей региона
    (producer_price_{регион}_{культура}_month) / (1 + рентабельность без субсидий по РФ за 2024 г.):
    зерно 16,8% (пшеница, ячмень, кукуруза), семена подсолнечника 52,4% —
    Росстат, «Сельское хозяйство в России 2025», табл. 6.18 (PDF-стр. 78; raw/sx2025_cost_tables.csv).
 2. Затраты на гектар = себестоимость тонны × средняя реальная урожайность региона за 2022–2024 гг. (т/га;
    yield_{регион}_{культура}_year, ц/га / 10).
 3. Статьи: топливо = л/га (прежние допущения) × средняя цена дизтоплива 2024 г. (diesel_price_{регион}_month);
    семена, удобрения и СЗР вместе = 55,9% затрат («сырьё и материалы», табл. 6.2, стр. 68; структура по
    растениеводству и животноводству, на отдельные культуры не разбита) — делятся в прежних пропорциях друг к другу;
    прочие = остаток до итога (оплата труда, амортизация, аренда, энергия, хранение, накладные).
Если рядом нет данных (null в 2024 г.) — расчёт по имеющимся месяцам с пометкой.
Запуск: .venv/bin/python scripts/calibrate_costs.py [--write]   (--write обновляет блоки defaultCosts в regions.ts)
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA_DIR, ROOT  # noqa: E402

PROFIT = {"wheat": 0.168, "barley": 0.168, "corn": 0.168, "sunflower": 0.524}  # рентабельность без субсидий, РФ, 2024
MATERIALS_SHARE = 0.559  # сырьё и материалы в структуре затрат, 2024
# прежние допущения: пропорции семена : удобрения : СЗР и расход топлива, л/га (не меняются)
OLD = {
    "krasnodar": {"wheat": (7000, 22000, 11000, 62), "barley": (6000, 17000, 8000, 55),
                  "sunflower": (11000, 17000, 13000, 58), "corn": (12000, 20000, 8000, 78)},
    "saratov": {"wheat": (4000, 6500, 3000, 52), "barley": (3500, 5000, 2500, 48),
                "sunflower": (6500, 5500, 4500, 50), "corn": (8000, 10000, 4000, 66)},
}
PLAN_YIELD = {"krasnodar": {"wheat": 55, "barley": 50, "sunflower": 26, "corn": 60},
              "saratov": {"wheat": 25, "barley": 20, "sunflower": 15, "corn": 35}}  # FALLBACK_YIELD_CHA в farm.ts, ц/га
CROPS = ["wheat", "barley", "sunflower", "corn"]


def series(name):
    return json.loads((DATA_DIR / (name + ".json")).read_text(encoding="utf-8"))["series"]


def mean(xs):
    return sum(xs) / len(xs)


def calc():
    rows = []
    for region in OLD:
        diesel = series("diesel_price_{}_month".format(region))
        d24 = mean([p["value"] for p in diesel if p["date"].startswith("2024-") and p["value"] is not None])
        d_now = [p["value"] for p in diesel if p["value"] is not None][-1]
        for crop in CROPS:
            pr = series("producer_price_{}_{}_month".format(region, crop))
            v24 = [p["value"] for p in pr if p["date"].startswith("2024-")]
            ok = [v for v in v24 if v is not None]
            p24 = mean(ok)
            p_now = [p["value"] for p in pr if p["value"] is not None][-1]
            p_now_date = [p["date"] for p in pr if p["value"] is not None][-1][:7]
            yl = [p["value"] for p in series("yield_{}_{}_year".format(region, crop)) if p["date"][:4] in ("2022", "2023", "2024")]
            y = mean(yl) / 10  # т/га
            cost_t = p24 / (1 + PROFIT[crop])
            cost_ha = cost_t * y
            s0, f0, z0, fuel_l = OLD[region][crop]
            mat = MATERIALS_SHARE * cost_ha
            k = mat / (s0 + f0 + z0)
            seeds, fert, szr = s0 * k, f0 * k, z0 * k
            fuel = fuel_l * d24
            other = cost_ha - seeds - fert - szr - fuel
            rows.append(dict(region=region, crop=crop, p24=p24, n24=len(ok), cost_t=cost_t, y=y, cost_ha=cost_ha,
                             seeds=seeds, fert=fert, szr=szr, fuel_l=fuel_l, fuel=fuel, other=other, d24=d24,
                             p_now=p_now, p_now_date=p_now_date, d_now=d_now))
    return rows


def margin(r, yld_t, price):
    cost = r["cost_ha"] - r["fuel"] + r["fuel_l"] * r["d_now"]  # топливо по текущей цене дизеля
    rev = yld_t * price
    return rev - cost, (rev - cost) / rev * 100


def rnd(x, step=100):
    return int(round(x / step) * step)


def block(rows, region):
    out = []
    for r in rows:
        if r["region"] != region:
            continue
        # «прочие» — остаток; округление до 100 ₽ делаем у остальных статей, остаток пересчитываем
        seeds, fert, szr = rnd(r["seeds"]), rnd(r["fert"]), rnd(r["szr"])
        other = rnd(r["cost_ha"]) - seeds - fert - szr - rnd(r["fuel"])
        out.append("      {}: costs({}, {}, {}, {}, {}),".format(r["crop"], seeds, fert, szr, r["fuel_l"], other))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()
    rows = calc()
    print("{:9} {:10} {:>7} {:>7} {:>6} {:>8} | {:>6} {:>6} {:>6} {:>6} {:>6} {:>7} | {:>7} {:>8} {:>8}".format(
        "регион", "культура", "цена24", "с/ст т", "т/га", "затр/га", "семена", "удобр", "СЗР", "топл", "проч", "проч%", "цена_сен", "марж_план", "марж_факт"))
    for r in rows:
        mp, mpp = margin(r, PLAN_YIELD[r["region"]][r["crop"]] / 10, r["p_now"])
        mf, mfp = margin(r, r["y"], r["p_now"])
        print("{:9} {:10} {:7.0f} {:7.0f} {:6.2f} {:8.0f} | {:6.0f} {:6.0f} {:6.0f} {:6.0f} {:6.0f} {:6.1f}% | {:7.0f} {:6.0f}/{:3.0f}% {:6.0f}/{:3.0f}%  (цена {}, 2024: {} мес.)".format(
            r["region"], r["crop"], r["p24"], r["cost_t"], r["y"], r["cost_ha"], r["seeds"], r["fert"], r["szr"], r["fuel"], r["other"],
            r["other"] / r["cost_ha"] * 100, r["p_now"], mp, mpp, mf, mfp, r["p_now_date"], r["n24"]))
    if a.write:
        p = ROOT / "src" / "config" / "regions.ts"
        s = p.read_text(encoding="utf-8")
        for region in OLD:
            i = s.index("  {}: {{".format(region))
            j = s.index("defaultCosts: {", i)
            k = s.index("    },", j)
            s = s[:j] + "defaultCosts: {\n" + "\n".join(block(rows, region)) + "\n" + s[k:]
        p.write_text(s, encoding="utf-8")
        print("regions.ts обновлён")


if __name__ == "__main__":
    main()

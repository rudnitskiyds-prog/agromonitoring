"""Кэш погоды Open-Meteo (CC BY 4.0) для офлайн-фолбэка сайта.

Источники: архив ERA5 https://archive-api.open-meteo.com/v1/archive, прогноз https://api.open-meteo.com/v1/forecast.
Пишет в public/data:
  temperature_mean|precipitation|active_temp_sum|dry_days _{region}_month.json — помесячные DataSeries (demo=false),
      имена по seriesFileName (их читает loadSeries);
  weather_{region}_archive_daily.json — последние ~400 дней по дням (фолбэк fetchArchive);
  weather_{region}_forecast.json     — прогноз на 16 дней (фолбэк fetchForecast).
Формат weather_*.json: {kind, region, lat, lon, timezone, source, source_url, updated_at, demo, note, days:[{date,tMin,tMax,tMean,precipitation}]}.
Если прогноз недоступен (лимит API) — берутся последние 16 дней архива, в note указано, что это заглушка.
Запуск: .venv/bin/python scripts/fetch_weather.py
"""
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import DATA_DIR, build_manifest, make_series, write_series  # noqa: E402

import requests  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
DAILY = "temperature_2m_min,temperature_2m_max,temperature_2m_mean,precipitation_sum"
SRC = "Open-Meteo, архив ERA5 (CC BY 4.0)"
SRC_URL = "https://open-meteo.com/en/docs/historical-weather-api"


def regions_from_ts():
    """Читает id, lat, lon, timezone из src/config/regions.ts — единый источник координат."""
    txt = (ROOT / "src" / "config" / "regions.ts").read_text(encoding="utf-8")
    res = []
    for m in re.finditer(r"\n  (\w+): \{\s*id: '(\w+)',\s*name: '[^']+',\s*shortName: '[^']+',\s*lat: ([\d.]+),\s*lon: ([\d.]+),\s*timezone: '([^']+)'", txt, re.S):
        res.append({"id": m.group(2), "lat": float(m.group(3)), "lon": float(m.group(4)), "tz": m.group(5)})
    if not res:
        raise SystemExit("не удалось прочитать регионы из regions.ts")
    return res


def get_json(url, params, tries=3):
    last = None
    for i in range(tries):
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            last = "{} {}".format(r.status_code, r.text[:150])
            if r.status_code == 429 or "limit" in r.text.lower():
                break
        except requests.RequestException as e:
            last = str(e)
        time.sleep(2 * (i + 1))
    raise RuntimeError(last)


def to_days(js):
    d = js["daily"]
    return [{"date": t, "tMin": d["temperature_2m_min"][i], "tMax": d["temperature_2m_max"][i],
             "tMean": d["temperature_2m_mean"][i], "precipitation": d["precipitation_sum"][i]}
            for i, t in enumerate(d["time"])]


def aggregate_monthly(days):
    """Те же правила, что aggregateMonthly в src/lib/weather.ts."""
    acc = {}
    for x in days:
        a = acc.setdefault(x["date"][:7], {"t": [], "p": 0.0, "act": 0.0, "dry": 0})
        if x["tMean"] is not None:
            a["t"].append(x["tMean"])
            if x["tMean"] > 10:
                a["act"] += x["tMean"]
        if x["precipitation"] is not None:
            a["p"] += x["precipitation"]
            if x["precipitation"] < 1:
                a["dry"] += 1
    return [(k + "-01", a) for k, a in sorted(acc.items())]


def dump(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")


def main():
    today = date.today()
    yesterday = today - timedelta(days=1)
    for reg in regions_from_ts():
        rid = reg["id"]
        base = {"latitude": reg["lat"], "longitude": reg["lon"], "daily": DAILY, "timezone": reg["tz"]}
        js = get_json(ARCHIVE_URL, dict(base, start_date="2019-01-01", end_date=yesterday.isoformat()))
        days = to_days(js)
        # ERA5 отстаёт на несколько дней: хвост без данных отрезаем
        while days and days[-1]["tMean"] is None and days[-1]["precipitation"] is None:
            days.pop()
        last_day = days[-1]["date"]
        pt = "точка {:.2f}, {:.2f}, ".format(reg["lat"], reg["lon"])
        note_m = "Помесячный агрегат дневных данных ERA5 ({}{}). Последний месяц может быть неполным (данные до {}).".format(pt, rid, last_day)
        for ind, unit, key, rnd in (("temperature_mean", "°C", "t", 1), ("precipitation", "мм", "p", 1),
                                    ("active_temp_sum", "°C", "act", 0), ("dry_days", "дни", "dry", 0)):
            pts = []
            for m, a in aggregate_monthly(days):
                v = (sum(a["t"]) / len(a["t"]) if a["t"] else None) if key == "t" else a[key]
                pts.append((m, None if v is None else round(v, rnd) if rnd else int(round(v))))
            write_series(make_series(ind, rid, None, unit, SRC, SRC_URL, last_day, "month", False, pts, note=note_m))
        meta = {"region": rid, "lat": reg["lat"], "lon": reg["lon"], "timezone": reg["tz"],
                "source": SRC, "source_url": SRC_URL, "demo": False}
        tail = days[-400:]
        dump(DATA_DIR / "weather_{}_archive_daily.json".format(rid),
             dict(meta, kind="archive_daily", updated_at=last_day, note="Последние ~400 дней ERA5 для фолбэка fetchArchive.", days=tail))
        try:
            fj = get_json(FORECAST_URL, dict(base, forecast_days=16))
            fdays = to_days(fj)
            dump(DATA_DIR / "weather_{}_forecast.json".format(rid),
                 dict(meta, kind="forecast", source="Open-Meteo, прогноз (CC BY 4.0)", source_url="https://open-meteo.com/en/docs",
                      updated_at=today.isoformat(), note="Прогноз на 16 дней, кэш на {}.".format(today.isoformat()), days=fdays))
            fb = "прогноз"
        except Exception as e:  # лимит API и т. п.
            dump(DATA_DIR / "weather_{}_forecast.json".format(rid),
                 dict(meta, kind="forecast", updated_at=last_day,
                      note="ЗАГЛУШКА-фолбэк: прогноз Open-Meteo был недоступен ({}); подставлены последние 16 дней архива ERA5, это НЕ прогноз.".format(str(e)[:80]),
                      days=days[-16:]))
            fb = "заглушка из архива"
        print(rid, "архив до", last_day, "дней:", len(days), "| прогноз:", fb)
    build_manifest()


if __name__ == "__main__":
    main()

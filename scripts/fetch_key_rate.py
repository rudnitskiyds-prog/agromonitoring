"""Ключевая ставка Банка России: реальная история с cbr.ru.

Берёт таблицу https://www.cbr.ru/hd_base/KeyRate/, сохраняет сырой HTML в raw/cbr_key_rate.html,
оставляет только даты изменения ставки (frequency=event) и пишет public/data/key_rate_russia_event.json (demo=false).
Запуск: .venv/bin/python scripts/fetch_key_rate.py [--from 01.01.2019] [--offline]
  --offline  — не ходить в сеть, разобрать уже сохранённый raw/cbr_key_rate.html
"""
import argparse
import re
import sys
from datetime import date

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import RAW_DIR, make_series, write_series  # noqa: E402

URL = "https://www.cbr.ru/hd_base/KeyRate/"


def parse_html(html):
    """Строки таблицы <table class="data"> -> [(ISO-дата, ставка)] по возрастанию даты."""
    m = re.search(r'<table class="data">(.*?)</table>', html, re.S)
    if not m:
        raise ValueError("таблица class=data не найдена на странице ЦБ")
    rows = re.findall(r"<td>\s*(\d{2})\.(\d{2})\.(\d{4})\s*</td>\s*<td>\s*([\d,\.]+)\s*</td>", m.group(1))
    out = [("{}-{}-{}".format(y, mo, d), float(v.replace(",", "."))) for d, mo, y, v in rows]
    return sorted(out)


def changes_only(daily):
    pts, prev = [], None
    for d, v in daily:
        if v != prev:
            pts.append((d, v))
            prev = v
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", default="01.01.2019")
    ap.add_argument("--offline", action="store_true")
    a = ap.parse_args()
    raw = RAW_DIR / "cbr_key_rate.html"
    if not a.offline:
        import requests
        to = date.today().strftime("%d.%m.%Y")
        r = requests.get(URL, params={"UniDbQuery.Posted": "True", "UniDbQuery.From": a.date_from, "UniDbQuery.To": to},
                         headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
        r.raise_for_status()
        RAW_DIR.mkdir(exist_ok=True)
        raw.write_text(r.text, encoding="utf-8")
    daily = parse_html(raw.read_text(encoding="utf-8"))
    if not daily:
        raise SystemExit("пустая выгрузка ЦБ")
    pts = changes_only(daily)
    d = make_series("key_rate", "russia", None, "%", "Банк России", URL, daily[-1][0], "event", False, pts,
                    note="Даты изменения ключевой ставки (ставка действует до следующей точки); "
                         "сырая выгрузка — raw/cbr_key_rate.html. Последнее наблюдение на сайте ЦБ: " + daily[-1][0])
    print(write_series(d), len(pts), "точек; последняя", pts[-1])


if __name__ == "__main__":
    main()

"""Разбор выгрузки ЕМИСС / Росстата (CSV или XLSX) в формат DataSeries и перезапись файла в public/data.

Как пользоваться
1. На https://www.fedstat.ru/ найдите показатель (цена производителей, урожайность, ...), нажмите «Выгрузить» -> CSV/XLSX,
   положите файл в raw/.
2. Запустите, например:
   .venv/bin/python scripts/parse_rosstat.py raw/price_wheat_krasnodar.xlsx \
       --indicator producer_price --region krasnodar --crop wheat --frequency month \
       --date-col "Период" --value-col "Значение" --filter "Регион=Краснодарский край"
   Результат: public/data/producer_price_krasnodar_wheat_month.json с demo=false (демо-ряд перезаписывается),
   затем пересобирается public/data/index.json.
3. --unit / --source-url можно не указывать: подставятся по умолчанию для показателя.

Понимаемые форматы даты: 2026-10-28, 28.10.2026, 10.2026, 2026-10, «Октябрь 2026», «октябрь 2026 г.», 2026.
Для frequency=year дата приводится к YYYY-01-01, month — к 1-му числу, week — к понедельнику недели.
Пропуски («-», «…», «x», пусто) -> value: null. Десятичная запятая и неразрывные пробелы понимаются.
Проверка без реальных файлов: .venv/bin/python scripts/parse_rosstat.py --self-test
"""
import argparse
import re
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import ROOT, build_manifest, make_series, validate_series, write_series  # noqa: E402

DEFAULTS = {  # indicator -> (unit, source, source_url)
    "producer_price": ("руб./т", "Росстат / ЕМИСС", "https://www.fedstat.ru/"),
    "diesel_price": ("руб./л", "Росстат, мониторинг цен на нефтепродукты", "https://rosstat.gov.ru/statistics/price"),
    "yield": ("ц/га", "Росстат / ЕМИСС", "https://www.fedstat.ru/"),
    "gross_harvest": ("тыс. т", "Росстат / ЕМИСС", "https://www.fedstat.ru/"),
    "sown_area": ("тыс. га", "Росстат / ЕМИСС", "https://www.fedstat.ru/"),
}
MONTHS = {m: i + 1 for i, m in enumerate(
    ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"])}


def parse_date(raw, frequency):
    s = str(raw).strip().lower().replace("\xa0", " ")
    y = m = d = None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", s):
        y, m, d = int(s[:4]), int(s[5:7]), int(s[8:10])
    elif re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", s):
        d, m, y = int(s[:2]), int(s[3:5]), int(s[6:])
    elif re.fullmatch(r"\d{2}\.\d{4}", s):
        m, y = int(s[:2]), int(s[3:])
    elif re.fullmatch(r"\d{4}-\d{2}", s):
        y, m = int(s[:4]), int(s[5:])
    else:
        mm = re.match(r"([а-я]+)\s+(\d{4})", s)
        if mm and mm.group(1) in MONTHS:
            m, y = MONTHS[mm.group(1)], int(mm.group(2))
        elif re.fullmatch(r"\d{4}( г\.?)?", s):
            y = int(s[:4])
    if y is None:
        raise ValueError("не удалось разобрать дату: {!r}".format(raw))
    if frequency == "year":
        return "{}-01-01".format(y)
    if frequency == "month":
        return "{}-{:02d}-01".format(y, m or 1)
    dt = date(y, m or 1, d or 1)
    if frequency == "week":
        dt -= timedelta(days=dt.weekday())
    return dt.isoformat()


def parse_value(raw):
    if raw is None:
        return None
    s = str(raw).strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    if s in ("", "-", "—", "…", "...", "x", "X", "nan", "None"):
        return None
    return float(s)


def read_table(path, sep=None, sheet=0):
    import pandas as pd
    p = Path(path)
    if p.suffix.lower() in (".xlsx", ".xls"):
        return pd.read_excel(p, sheet_name=sheet, dtype=str)
    return pd.read_csv(p, sep=sep, engine="python", dtype=str, encoding="utf-8-sig")


def to_series(df, a):
    for flt in a.filter or []:
        col, _, val = flt.partition("=")
        df = df[df[col].astype(str).str.strip() == val.strip()]
    pts = {}
    for _, row in df.iterrows():
        try:
            pts[parse_date(row[a.date_col], a.frequency)] = parse_value(row[a.value_col])
        except ValueError:
            continue  # строки-заголовки, итоги, сноски
    if not pts:
        raise SystemExit("после фильтрации не осталось строк с датой и значением")
    unit, source, url = DEFAULTS.get(a.indicator, (None, None, None))
    unit, source, url = a.unit or unit, a.source or source, a.source_url or url
    if not (unit and source and url):
        raise SystemExit("укажите --unit, --source и --source-url для этого показателя")
    points = sorted(pts.items())
    return make_series(a.indicator, a.region, a.crop, unit, source, url, a.updated_at or date.today().isoformat(),
                       a.frequency, False, points, note="Реальная выгрузка: " + Path(a.file).name)


def run(a, data_dir=None):
    d = to_series(read_table(a.file, a.sep, a.sheet), a)
    errs = validate_series(d)
    if errs:
        raise SystemExit("ряд не прошёл проверку формата: {}".format(errs))
    name = write_series(d, data_dir)
    build_manifest(data_dir)
    return name, d


def self_test():
    import pandas as pd
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        csv = tmp / "x.csv"
        csv.write_text("Регион;Период;Значение\nКраснодарский край;Октябрь 2026;15 400,5\nКраснодарский край;Сентябрь 2026;-\n"
                       "Саратовская область;Октябрь 2026;1\n", encoding="utf-8")
        xlsx = tmp / "y.xlsx"
        pd.DataFrame({"Период": ["2024", "2025"], "Значение": ["51,2", "55"]}).to_excel(xlsx, index=False)
        out = tmp / "out"
        ns = argparse.Namespace(file=str(csv), indicator="producer_price", region="krasnodar", crop="wheat", frequency="month",
                                date_col="Период", value_col="Значение", filter=["Регион=Краснодарский край"], unit=None,
                                source=None, source_url=None, updated_at="2026-10-01", sep=";", sheet=0)
        name, d = run(ns, out)
        assert name == "producer_price_krasnodar_wheat_month.json", name
        assert d["series"] == [{"date": "2026-09-01", "value": None}, {"date": "2026-10-01", "value": 15400.5}], d["series"]
        assert d["demo"] is False
        ns2 = argparse.Namespace(**dict(vars(ns), file=str(xlsx), indicator="yield", frequency="year", filter=None, sep=None))
        name2, d2 = run(ns2, out)
        assert d2["series"][0] == {"date": "2024-01-01", "value": 51.2} and d2["unit"] == "ц/га"
        assert parse_date("28.10.2026", "week") == "2026-10-26"
        print("self-test OK:", name, name2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", nargs="?", help="CSV/XLSX из raw/")
    ap.add_argument("--indicator"); ap.add_argument("--region"); ap.add_argument("--crop", default=None)
    ap.add_argument("--frequency", choices=["day", "week", "month", "year", "event"])
    ap.add_argument("--date-col", default="Период"); ap.add_argument("--value-col", default="Значение")
    ap.add_argument("--filter", action="append", help='"Колонка=Значение", можно несколько раз')
    ap.add_argument("--unit"); ap.add_argument("--source"); ap.add_argument("--source-url")
    ap.add_argument("--updated-at"); ap.add_argument("--sep", default=None); ap.add_argument("--sheet", default=0)
    ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        return self_test()
    if not (a.file and a.indicator and a.region and a.frequency):
        ap.error("нужны file, --indicator, --region, --frequency")
    name, d = run(a)
    print("записан", name, "точек:", len(d["series"]))


if __name__ == "__main__":
    main()

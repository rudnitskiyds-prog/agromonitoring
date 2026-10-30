"""Дополнительные реальные источники для collect.py: ЕМИСС (fedstat.ru) и xls/xlsx Росстата.

  * emiss_prices   — ЕМИСС 57693: цены производителей по субъектам, помесячно (продление рядов назад);
  * crop_series    — урожайность / валовой сбор / посевные площади: субъекты (ЕМИСС 31533, 30950, 31328)
                     и РФ (xls Росстата uroj_, val_, posev_pl);
  * diesel_monthly — потребительская цена дизтоплива по субъектам помесячно (sred_potreb_cen_*.xlsx).
Все скачивания сохраняются в raw/ (ЕМИСС — как JSON raw/emiss_<id>.json), --offline читает их оттуда.
Проверка TLS включена, сертификаты Минцифры — scripts/certs/russian_ca_bundle.pem.
"""
import json
import re
import ssl
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from common import RAW_DIR, make_series, validate_series
import emiss

CA_BUNDLE = Path(__file__).resolve().parent / "certs" / "russian_ca_bundle.pem"
MEDIABANK = "https://rosstat.gov.ru/storage/mediabank/"
PRICE_PAGE = "https://rosstat.gov.ru/statistics/price"
ECONOMY_PAGE = "https://rosstat.gov.ru/enterprise_economy"
MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]
CROPS = ["wheat", "barley", "sunflower", "corn"]


class AgroError(Exception):
    pass


def _get(url, timeout=300):
    ctx = ssl.create_default_context(cafile=str(CA_BUNDLE))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (agromonitoring collector)"})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            return r.read()
    except OSError as e:
        raise AgroError("Не удалось скачать {}: {}".format(url, e))


def fetch_file(name, offline, refresh=True):
    """Файл из mediabank Росстата -> raw/<name>. refresh=False: не перекачивать, если уже лежит (архивные годы)."""
    dest = RAW_DIR / name
    if offline or (dest.exists() and not refresh):
        if not dest.exists():
            raise AgroError("Нет файла raw/{} (запустите без --offline)".format(name))
        return dest
    dest.write_bytes(_get(MEDIABANK + urllib.parse.quote(name)))
    return dest


def num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# ── ЕМИСС с кэшем в raw/ ───────────────────────────────────────────────────────
def emiss_rows(iid, selector, offline):
    """selector(ind) -> {object_id: [value_id]}; возвращает (rows, ind_meta). Кэш: raw/emiss_<id>.json."""
    cache = RAW_DIR / "emiss_{}.json".format(iid)
    if offline:
        if not cache.exists():
            raise AgroError("Нет кэша raw/{} (запустите без --offline)".format(cache.name))
        d = json.loads(cache.read_text(encoding="utf-8"))
        return d["rows"], d
    ind = emiss.Indicator(iid)
    sel = selector(ind)
    rows = ind.fetch(sel)
    d = {"indicator": iid, "title": ind.title, "unit": ind.unit, "fetched_at": date.today().isoformat(), "rows": rows}
    cache.write_text(json.dumps(d, ensure_ascii=False) + "\n", encoding="utf-8")
    return rows, d


def _vals(ind, oid, names=None, pattern=None):
    v = ind.objects[oid]["values"]
    if names is not None:
        return [v[n] for n in names if n in v]
    return [i for t, i in v.items() if re.match(pattern, t)]


# ── цены производителей по субъектам (ЕМИСС 57693) ────────────────────────────
PRICE_CROP_TITLES = {"wheat": ["Пшеница"], "barley": ["Ячмень"], "sunflower": ["Семена подсолнечника"],
                     "corn": ["Кукуруза", "Кукуруза [1758224]"]}


def emiss_prices(region_names, offline):
    """{(region_id, crop): {'YYYY-MM-01': value|None}} за 2020–2026 (только субъекты из regions.ts)."""
    def selector(ind):
        o = ind.objects
        reg = _vals(ind, 57831, names=list(region_names))
        crops = [i for c in CROPS for i in _vals(ind, 57939, names=PRICE_CROP_TITLES[c])]
        sel = {57831: reg, 57939: crops, 57956: _vals(ind, 57956, names=["Тонна;^метрическая тонна (1000 кг)"]),
               33560: _vals(ind, 33560, names=MONTHS), 3: _vals(ind, 3, names=[str(y) for y in range(2020, 2027)])}
        for oid in (0, 30611):
            sel[oid] = list(o[oid]["values"].values())
        return sel

    rows, meta = emiss_rows(57693, selector, offline)
    title_to_crop = {t: c for c, ts in PRICE_CROP_TITLES.items() for t in ts}
    out = {}
    for r in rows:
        rid = region_names.get(r["dim57831"])
        crop = title_to_crop.get(r["dim57939"])
        if not rid or not crop or r["dim33560"] not in MONTHS:
            continue
        m = MONTHS.index(r["dim33560"]) + 1
        for y, v in emiss.Indicator.year_values(r).items():
            d = out.setdefault((rid, crop), {})
            key = "{}-{:02d}-01".format(y, m)
            if v is not None or key not in d:
                d[key] = v
    return out, meta


# ── урожайность / сбор / площади ──────────────────────────────────────────────
def _sunflower_after_finishing(ind):
    return _vals(ind, 58745, pattern=r"Подсолнечник на зерно в весе после доработки")


def emiss_crops(region_names, offline):
    """-> {(indicator, region_id, crop): {year: value}} по ЕМИСС для субъектов; значения в единицах ряда."""
    spec = {31533: "yield", 30950: "gross_harvest", 31328: "sown_area"}
    names_by_crop = {"wheat": ["Пшеница озимая и яровая"], "barley": ["Ячмень озимый и яровой"], "corn": ["Кукуруза на зерно"]}
    out, metas = {}, {}
    for iid, indicator in spec.items():
        def selector(ind, iid=iid):
            crops = [i for c in names_by_crop.values() for i in _vals(ind, 58745, names=c)]
            crops += _vals(ind, 58745, pattern=r"Подсолнечник") if iid == 31328 else _sunflower_after_finishing(ind)
            sel = {58745: crops, 57831: _vals(ind, 57831, names=list(region_names)),
                   58423: _vals(ind, 58423, names=["Хозяйства всех категорий"]), 3: _vals(ind, 3, names=[str(y) for y in range(2019, 2027)])}
            for oid in (0, 30611, 33560):
                sel[oid] = list(ind.objects[oid]["values"].values())
            return sel

        rows, meta = emiss_rows(iid, selector, offline)
        metas[indicator] = meta
        for r in rows:
            rid = region_names.get(r["dim57831"])
            t = r["dim58745"]
            crop = next((c for c, ns in names_by_crop.items() if t in ns), None)
            if crop is None and t.startswith("Подсолнечник"):
                crop = "sunflower"
            if not rid or not crop:
                continue
            d = out.setdefault((indicator, rid, crop), {})
            for y, v in emiss.Indicator.year_values(r).items():
                if v is not None:
                    d[y] = v / 10 if indicator == "gross_harvest" else v  # тыс. ц -> тыс. т
    return out, metas


def pdf_sunflower(region_names, offline):
    """Подсолнечник по субъектам (2020, 2022, 2023, 2024) из «Регионы России. Социально-экономические показатели 2025» (табл. 14.14, 14.15):
    ЕМИСС по подсолнечнику после доработки не публикует 2024 (и валовой сбор 2023), а ряд 2019–2023 — в весе после доработки; чтобы не смешивать
    меры, 2024 берётся из сборника (тоже после доработки). Кэш разбора: raw/regions_sunflower.csv."""
    cache = RAW_DIR / "regions_sunflower.csv"
    if cache.exists():
        res = {}
        for line in cache.read_text(encoding="utf-8").splitlines()[1:]:
            ind, rid, y, val = line.split(";")
            res[(ind, rid, int(y))] = float(val)
        return res
    if offline:
        raise AgroError("Нет raw/regions_sunflower.csv (запустите без --offline)")
    try:
        import pypdf
    except ImportError:
        raise AgroError("Для разбора PDF нужен pypdf (pip install -r scripts/requirements.txt)")
    pdf = fetch_file("Region_Pokaz_2025.pdf", offline=False, refresh=False)
    reader = pypdf.PdfReader(str(pdf))
    res = {}
    heads = {"14.14. ВАЛОВОЙ СБОР СЕМЯН ПОДСОЛНЕЧНИКА": "gross_harvest", "14.15. УРОЖАЙНОСТЬ ПОДСОЛНЕЧНИКА": "yield"}
    pat = r"\d{1,3}(?: \d{3})*,\d"
    current = None
    for pno in range(600, min(len(reader.pages), 660)):
        text = reader.pages[pno].extract_text() or ""
        pos = 0
        # таблица может занимать несколько страниц: строки субъектов идут после заголовка, до следующей таблицы 14.xx
        for m in re.finditer(r"^14\.\d+\. [А-ЯЁ]", text, re.M):
            seg = text[pos:m.start()]
            if current:
                _scan(seg, current, region_names, res, pat)
            current = next((v for h, v in heads.items() if text.startswith(h, m.start())), None)
            pos = m.start()
        if current:
            _scan(text[pos:], current, region_names, res, pat)
    if len(res) < 8 * len(region_names):
        raise AgroError("Не удалось найти подсолнечник 2024 в сборнике «Регионы России» (изменилась вёрстка?)")
    cache.write_text("indicator;region;year;value\n" + "\n".join("{};{};{};{}".format(k[0], k[1], k[2], v) for k, v in sorted(res.items())) + "\n", encoding="utf-8")
    return res


def _scan(block, ind, region_names, res, pat):
    for name, rid in region_names.items():
        m = re.search(r"^{}\s+(.+)$".format(re.escape(name)), block, re.M)
        if m:
            vals = re.findall(pat, m.group(1))
            if len(vals) >= 6:
                for yi, y in ((2, 2020), (3, 2022), (4, 2023), (5, 2024)):
                    res[(ind, rid, y)] = float(vals[yi].replace(" ", "").replace(",", "."))


def _rf_sheet(path, sheet):
    import xlrd
    ws = xlrd.open_workbook(str(path)).sheet_by_name(sheet)
    hdr = None
    for r in range(min(10, ws.nrows)):
        row = ws.row_values(r)
        if row[1:3] == [1990.0, 1991.0] or str(row[1]).startswith("1990"):
            hdr = r
            break
    if hdr is None:
        raise AgroError("{}: не найдена строка лет".format(path.name))
    years = {}
    for c, h in enumerate(ws.row_values(hdr)):
        m = re.match(r"(\d{4})", str(h).strip()) if c > 0 else None
        if m:
            years[c] = int(m.group(1))
    res = {}
    for r in range(hdr + 1, ws.nrows):
        row = ws.row_values(r)
        t = re.sub(r"^из них:\s*", "", " ".join(str(row[0]).split()).lower())
        crop = None
        if t == "пшеница":
            crop = "wheat"
        elif t == "ячмень":
            crop = "barley"
        elif t in ("кукуруза", "кукуруза на зерно"):
            crop = "corn"
        elif "подсолнечник" in t:
            crop = "sunflower"
        if crop and crop not in res:
            res[crop] = {y: num(row[c]) for c, y in years.items() if y >= 2019 and num(row[c]) is not None}
    return res


def rf_crops(offline):
    """{(indicator, 'russia', crop): {year: value}} из xls Росстата: uroj_ (ц/га), val_ (тыс. т), posev_pl (тыс. га)."""
    out = {}
    for fname, indicator in (("uroj_.xls", "yield"), ("val_.xls", "gross_harvest"), ("posev_pl.xls", "sown_area")):
        path = fetch_file(fname, offline)
        for crop, d in _rf_sheet(path, "1").items():
            out[(indicator, "russia", crop)] = d
    return out


# ── дизтопливо по субъектам, помесячно ────────────────────────────────────────
DIESEL_FILES = ["Potreb_cen_2021(1).xlsx", "sred_potreb_cen_2022.xlsx", "sred_potreb_cen_2023.xlsx",
                "sred_potreb_cen_2024.xlsx", "sred_potreb_cen_2025.xlsx", "sred_potreb_cen_09-2026.xlsx"]


def latest_potreb_name(offline):
    """Имя файла текущего года (sred_potreb_cen_MM-YYYY.xlsx) со страницы цен; офлайн — самый свежий в raw/."""
    if offline:
        files = sorted(RAW_DIR.glob("sred_potreb_cen_??-20??.xlsx"), key=lambda p: (p.name[-9:-5], p.name[-12:-10]))
        return files[-1].name if files else None
    html = _get(PRICE_PAGE).decode("utf-8", "replace")
    found = re.findall(r"/(sred_potreb_cen_(\d{2})-(\d{4})\.xlsx)", html)
    return max(found, key=lambda f: (f[2], f[1]))[0] if found else None


def diesel_monthly(region_names, offline):
    """-> {region_id|'russia': {'YYYY-MM-01': value}} из помесячных листов 'MM(YYYY)' файлов sred_potreb_cen."""
    import openpyxl
    wanted = dict(region_names, **{"Российская Федерация": "russia"})
    files = list(DIESEL_FILES[:-1])
    cur = latest_potreb_name(offline)
    if cur:
        files.append(cur)
    out = {}
    for fname in files:
        path = fetch_file(fname, offline, refresh=(fname == cur))
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            m = re.fullmatch(r"(\d{2})(?:\((\d{4})\))?", ws.title.strip())
            if not m:
                continue
            year = m.group(2) or re.search(r"(20\d{2})", fname).group(1)  # в файле 2021 г. листы называются просто «01»…«12»
            key = "{}-{}-01".format(year, m.group(1))
            col = None
            for row in ws.iter_rows(min_row=1, max_row=700, values_only=True):
                if col is None:
                    for i, h in enumerate(row):
                        if h and str(h).strip().lower().startswith("дизельное топливо"):
                            col = i
                            break
                    continue
                name = " ".join(str(row[1]).split()) if row[1] else ""
                if name in wanted:
                    v = num(row[col])
                    if v is not None:
                        out.setdefault(wanted[name], {})[key] = v
    return out

"""Мини-клиент ЕМИСС (fedstat.ru): структура показателя со страницы и выгрузка данных через JSON-эндпоинт сетки.

Проверка TLS включена; цепочка Минцифры — scripts/certs/russian_ca_bundle.pem. Только stdlib.
Порядок: страница показателя -> cookie + описание измерений (фильтров) -> POST /indicator/dataGrid.do?id=ID
с lineObjectIds / columnObjectIds / selectedFilterIds ("{объект}_{значение}") -> JSON {"results": [...]}.
"""
import http.cookiejar
import json
import re
import ssl
import urllib.request
from pathlib import Path

CA_BUNDLE = Path(__file__).resolve().parent / "certs" / "russian_ca_bundle.pem"
BASE = "https://www.fedstat.ru"


class EmissError(Exception):
    pass


def _dec(t):
    return re.sub(r"\\u([0-9A-Fa-f]{4})", lambda m: chr(int(m.group(1), 16)), t)


class Indicator:
    def __init__(self, indicator_id, timeout=90):
        self.id = indicator_id
        self.timeout = timeout
        ctx = ssl.create_default_context(cafile=str(CA_BUNDLE))
        self.cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cj), urllib.request.HTTPSHandler(context=ctx))
        self.op.addheaders = [("User-Agent", "Mozilla/5.0 (agromonitoring collector)")]
        try:
            page = self.op.open("{}/indicator/{}".format(BASE, indicator_id), timeout=timeout).read().decode("utf-8", "replace")
        except OSError as e:
            raise EmissError("ЕМИСС недоступен ({}): {}".format(indicator_id, e))
        self.title, self.unit = self._meta(page)
        self.objects, self.left, self.top = self._parse(page)

    @staticmethod
    def _meta(page):
        t = re.search(r"title: '((?:[^'\\]|\\.)*)',\s*unit: '((?:[^'\\]|\\.)*)'", page)
        return (_dec(t.group(1)), _dec(t.group(2))) if t else ("", "")

    @staticmethod
    def _parse(page):
        i, j = page.find("filters: {"), page.find("left_columns")
        if i < 0 or j < 0:
            raise EmissError("Не удалось разобрать структуру показателя ЕМИСС (изменилась вёрстка?)")
        blk = page[i:j]
        objs = {}
        for p in re.split(r"\n\s{28}(?=\d+: \{\s*\n\s*title)", blk)[1:]:
            oid = int(re.match(r"(\d+):", p).group(1))
            title = _dec(re.search(r"title: '([^']*)'", p).group(1))
            vals = {}
            for m in re.finditer(r"\n\s{36}(\d+): \{\s*title: '([^']*)'", p):
                t = _dec(m.group(2))
                vals[t if t not in vals else "{} [{}]".format(t, m.group(1))] = int(m.group(1))  # одинаковые названия различаем по id
            objs[oid] = {"title": title, "values": vals}
        tail = page[j:j + 400]
        left = [int(x) for x in re.findall(r"\d+", re.search(r"left_columns:\s*\[([^\]]*)\]", tail).group(1))]
        top = [int(x) for x in re.findall(r"\d+", re.search(r"top_columns:\s*\[([^\]]*)\]", page[j:j + 600]).group(1))]
        return objs, left, top

    def object_by_title(self, part):
        for oid, o in self.objects.items():
            if part.lower() in o["title"].lower():
                return oid
        raise EmissError("В показателе {} нет измерения «{}»".format(self.id, part))

    def fetch(self, selected, lines=None, cols=None):
        """selected: {object_id: [value_id, ...]} — выбранные значения; остальные измерения должны попасть в lines/cols.
        Возвращает список строк results (dict)."""
        lines = lines if lines is not None else [o for o in self.objects if o not in (3,)]
        cols = cols if cols is not None else [3]
        body = "&".join(["lineObjectIds={}".format(l) for l in lines] + ["columnObjectIds={}".format(c) for c in cols]
                        + ["selectedFilterIds={}_{}".format(o, v) for o, vs in selected.items() for v in vs])
        req = urllib.request.Request(
            "{}/indicator/dataGrid.do?id={}".format(BASE, self.id), data=body.encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest",
                     "Referer": "{}/indicator/{}".format(BASE, self.id)})
        try:
            raw = self.op.open(req, timeout=self.timeout).read().decode("utf-8", "replace")
            return json.loads(raw)["results"]
        except (OSError, ValueError, KeyError) as e:
            raise EmissError("Ошибка выгрузки показателя {}: {}".format(self.id, e))

    @staticmethod
    def year_values(row):
        """{год: float|None} из ключей вида dim2019_d..._i.."""
        out = {}
        for k, v in row.items():
            m = re.match(r"dim(\d{4})_d\d+_i\d+$", k)
            if m:
                s = str(v).replace(",", ".").replace("\xa0", "").replace(" ", "")
                try:
                    out[int(m.group(1))] = float(s)
                except ValueError:
                    out[int(m.group(1))] = None
        return out

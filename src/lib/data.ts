// Загрузка рядов из public/data. Владелец — data-engineer.
import type { DataManifest, DataSeries, LoadManifest, LoadSeries, SeriesFileName, SeriesKey, SourceOf } from '../types';

export const seriesFileName: SeriesFileName = ({ indicator, region, crop, frequency }) =>
  `${indicator}_${region}${crop ? `_${crop}` : ''}_${frequency}.json`;

const dataUrl = (file: string): string => `${import.meta.env.BASE_URL}data/${file}`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Проверка формата раздела 9; возвращает текст проблемы или null. */
function checkSeries(v: unknown): string | null {
  if (!isObject(v)) return 'ожидался объект';
  for (const k of ['indicator', 'region', 'unit', 'source', 'source_url', 'updated_at', 'frequency']) {
    if (typeof v[k] !== 'string') return `нет текстового поля «${k}»`;
  }
  if (!('crop' in v) || (v.crop !== null && typeof v.crop !== 'string')) return 'нет поля «crop»';
  if (typeof v.demo !== 'boolean') return 'поле «demo» должно быть true/false';
  if (!Array.isArray(v.series)) return 'нет массива «series»';
  for (const p of v.series) {
    if (!isObject(p) || typeof p.date !== 'string' || !(p.value === null || typeof p.value === 'number')) {
      return 'в «series» есть точка неверного формата';
    }
  }
  return null;
}

async function fetchJson(file: string, what: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(dataUrl(file));
  } catch {
    throw new Error(`Не удалось загрузить ${what}: нет соединения или файл недоступен (${file}).`);
  }
  if (!res.ok) throw new Error(`Не удалось загрузить ${what}: сервер ответил ${res.status} (${file}).`);
  try {
    return await res.json();
  } catch {
    throw new Error(`Файл ${file} повреждён: это не JSON.`);
  }
}

const seriesCache = new Map<string, Promise<DataSeries>>();
let manifestCache: Promise<DataManifest> | null = null;

export const loadSeries: LoadSeries = (key: SeriesKey) => {
  const file = seriesFileName(key);
  let p = seriesCache.get(file);
  if (!p) {
    p = fetchJson(file, 'ряд данных').then((json) => {
      const problem = checkSeries(json);
      if (problem) throw new Error(`Файл ${file} имеет неверный формат: ${problem}.`);
      return json as DataSeries;
    });
    seriesCache.set(file, p);
    p.catch(() => seriesCache.delete(file)); // ошибку не кэшируем — можно повторить
  }
  return p;
};

export const loadManifest: LoadManifest = () => {
  if (!manifestCache) {
    manifestCache = fetchJson('index.json', 'перечень данных').then((json) => {
      if (!isObject(json) || typeof json.generated_at !== 'string' || !Array.isArray(json.files)) {
        throw new Error('Файл index.json имеет неверный формат.');
      }
      return json as unknown as DataManifest;
    });
    manifestCache.catch(() => {
      manifestCache = null;
    });
  }
  return manifestCache;
};

export const sourceOf: SourceOf = ({ source, source_url, updated_at, demo }) => ({ source, source_url, updated_at, demo });

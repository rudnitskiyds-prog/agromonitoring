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

const loadOwn = (key: SeriesKey): Promise<DataSeries> => {
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

/**
 * Загружает ряд. Фолбэк: цена дизтоплива публикуется Росстатом только по РФ, поэтому если для региона
 * diesel_price нет в index.json (или файла нет), возвращается diesel_price_russia_week как есть, с region: 'russia' —
 * интерфейс по этому полю показывает, что это среднее по России.
 */
export const loadSeries: LoadSeries = async (key: SeriesKey) => {
  if (key.indicator !== 'diesel_price' || key.region === 'russia') return loadOwn(key);
  const russia: SeriesKey = { ...key, region: 'russia', crop: null };
  let inIndex: boolean | null = null; // null — манифест недоступен, пробуем по месту
  try {
    const file = seriesFileName(key);
    inIndex = (await loadManifest()).files.some((f) => f.file === file);
  } catch {
    inIndex = null;
  }
  if (inIndex === false) return loadOwn(russia);
  try {
    return await loadOwn(key);
  } catch (e) {
    if (inIndex === null) return loadOwn(russia);
    throw e;
  }
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

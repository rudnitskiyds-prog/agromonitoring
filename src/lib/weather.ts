// Погода Open-Meteo (CC BY 4.0) с фолбэком на public/data/weather_*.json. Владелец — data-engineer.
import type {
  AggregateMonthly,
  DailyWeather,
  FetchArchive,
  FetchForecast,
  RegionConfig,
  SourceRef,
  WeatherResult,
} from '../types';

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

const TIMEOUT_MS = 8000;
const DAILY = 'temperature_2m_min,temperature_2m_max,temperature_2m_mean,precipitation_sum';
const ACTIVE_T = 10; // °C
const DRY_MM = 1; // мм

const SRC_ARCHIVE = { source: 'Open-Meteo, архив ERA5 (CC BY 4.0)', source_url: 'https://open-meteo.com/en/docs/historical-weather-api' };
const SRC_FORECAST = { source: 'Open-Meteo, прогноз (CC BY 4.0)', source_url: 'https://open-meteo.com/en/docs' };

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_min: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_mean: (number | null)[];
  precipitation_sum: (number | null)[];
}

const parseDaily = (json: unknown): DailyWeather[] => {
  const d = (json as { daily?: OpenMeteoDaily } | null)?.daily;
  if (!d || !Array.isArray(d.time)) throw new Error('Неожиданный ответ Open-Meteo');
  return d.time.map((date, i) => ({
    date,
    tMin: d.temperature_2m_min?.[i] ?? null,
    tMax: d.temperature_2m_max?.[i] ?? null,
    tMean: d.temperature_2m_mean?.[i] ?? null,
    precipitation: d.precipitation_sum?.[i] ?? null,
  }));
};

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Open-Meteo ответил ${res.status}`);
    const json = (await res.json()) as { error?: boolean; reason?: string };
    if (json && json.error) throw new Error(json.reason ?? 'Ошибка Open-Meteo');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

interface WeatherCache {
  source: string;
  source_url: string;
  updated_at: string;
  demo: boolean;
  days: DailyWeather[];
}

async function readCache(kind: 'forecast' | 'archive_daily', region: RegionConfig): Promise<WeatherCache> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/weather_${region.id}_${kind}.json`);
  if (!res.ok) throw new Error(`Нет кэша погоды для региона «${region.name}» (${res.status})`);
  const c = (await res.json()) as WeatherCache;
  if (!Array.isArray(c.days)) throw new Error('Кэш погоды повреждён');
  return c;
}

const fromCache = (c: WeatherCache, days: DailyWeather[]): WeatherResult<DailyWeather[]> => {
  const source: SourceRef = { source: c.source, source_url: c.source_url, updated_at: c.updated_at, demo: c.demo };
  return { data: days, origin: 'cache', source };
};

const today = (): string => new Date().toISOString().slice(0, 10);

export const fetchForecast: FetchForecast = async (region, days = 16) => {
  const url =
    `${FORECAST_URL}?latitude=${region.lat}&longitude=${region.lon}&daily=${DAILY}` +
    `&timezone=${encodeURIComponent(region.timezone)}&forecast_days=${days}`;
  try {
    const data = parseDaily(await getJson(url));
    return { data, origin: 'live', source: { ...SRC_FORECAST, updated_at: today(), demo: false } };
  } catch {
    const c = await readCache('forecast', region);
    return fromCache(c, c.days.slice(0, days));
  }
};

export const fetchArchive: FetchArchive = async (region, from, to) => {
  const url =
    `${ARCHIVE_URL}?latitude=${region.lat}&longitude=${region.lon}&daily=${DAILY}` +
    `&timezone=${encodeURIComponent(region.timezone)}&start_date=${from}&end_date=${to}`;
  try {
    const data = parseDaily(await getJson(url));
    // хвост архива (последние дни ERA5) приходит пустым — отрезаем
    while (data.length && data[data.length - 1].tMean === null && data[data.length - 1].precipitation === null) data.pop();
    return { data, origin: 'live', source: { ...SRC_ARCHIVE, updated_at: data.length ? data[data.length - 1].date : to, demo: false } };
  } catch {
    const c = await readCache('archive_daily', region);
    return fromCache(c, c.days.filter((d) => d.date >= from && d.date <= to));
  }
};

export const aggregateMonthly: AggregateMonthly = (days) => {
  const acc = new Map<string, { sum: number; n: number; precip: number; active: number; dry: number }>();
  for (const d of days) {
    const key = `${d.date.slice(0, 7)}-01`;
    let a = acc.get(key);
    if (!a) {
      a = { sum: 0, n: 0, precip: 0, active: 0, dry: 0 };
      acc.set(key, a);
    }
    if (d.tMean !== null) {
      a.sum += d.tMean;
      a.n += 1;
      if (d.tMean > ACTIVE_T) a.active += d.tMean;
    }
    if (d.precipitation !== null) {
      a.precip += d.precipitation;
      if (d.precipitation < DRY_MM) a.dry += 1;
    }
  }
  const r1 = (x: number): number => Math.round(x * 10) / 10;
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, a]) => ({
      month,
      tMean: a.n ? r1(a.sum / a.n) : null,
      precipitation: r1(a.precip),
      activeTempSum: r1(a.active),
      dryDays: a.dry,
    }));
};

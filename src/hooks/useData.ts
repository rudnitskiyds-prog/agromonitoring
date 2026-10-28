// Связующие хуки загрузки данных для страниц (зона оркестратора).
// Страницы не вызывают loadSeries/fetchForecast напрямую — только через эти хуки,
// чтобы состояния загрузки и ошибок везде были одинаковыми.
import { useEffect, useState } from 'react';
import type { DailyWeather, DataManifest, DataSeries, RegionConfig, SeriesKey, WeatherResult } from '../types';
import { loadManifest, loadSeries } from '../lib/data';
import { fetchForecast } from '../lib/weather';

export type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: Error };

const LOADING = { status: 'loading', data: null, error: null } as const;

/** Общий помощник: запускает load при смене deps, отменяет устаревший результат. */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>(LOADING);
  useEffect(() => {
    let alive = true;
    setState(LOADING);
    load().then(
      (data) => alive && setState({ status: 'ready', data, error: null }),
      (e: unknown) => alive && setState({ status: 'error', data: null, error: e instanceof Error ? e : new Error(String(e)) }),
    );
    return () => {
      alive = false;
    };
    // deps задаёт вызывающий: load — свежая стрелка на каждом рендере
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const keyId = (k: SeriesKey) => `${k.indicator}|${k.region}|${k.crop ?? ''}|${k.frequency}`;

/** Один ряд из public/data. key = null — ничего не грузить (status остаётся 'loading'). */
export function useSeries(key: SeriesKey | null): AsyncState<DataSeries> {
  return useAsync(() => (key ? loadSeries(key) : new Promise<DataSeries>(() => {})), [key ? keyId(key) : null]);
}

/**
 * Несколько рядов сразу, результат — в том же порядке, что keys.
 * Ошибка любого ряда — ошибка всего набора (страница показывает одно сообщение).
 */
export function useSeriesList(keys: SeriesKey[]): AsyncState<DataSeries[]> {
  return useAsync(() => Promise.all(keys.map(loadSeries)), [keys.map(keyId).join(',')]);
}

/** Прогноз Open-Meteo на 16 дней с фолбэком на кэш (origin: 'live' | 'cache'). */
export function useForecast(region: RegionConfig | null, days = 16): AsyncState<WeatherResult<DailyWeather[]>> {
  return useAsync(
    () => (region ? fetchForecast(region, days) : new Promise<WeatherResult<DailyWeather[]>>(() => {})),
    [region?.id ?? null, days],
  );
}

/** Перечень рядов public/data/index.json — для таблицы источников. */
export function useManifest(): AsyncState<DataManifest> {
  return useAsync(loadManifest, []);
}

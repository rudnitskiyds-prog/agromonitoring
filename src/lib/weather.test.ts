import { afterEach, describe, expect, it, vi } from 'vitest';
import { aggregateMonthly, fetchArchive } from './weather';
import type { DailyWeather, RegionConfig } from '../types';

const day = (date: string, tMean: number | null, precipitation: number | null): DailyWeather => ({
  date,
  tMin: null,
  tMax: null,
  tMean,
  precipitation,
});

describe('aggregateMonthly', () => {
  it('пустой вход -> пустой результат', () => {
    expect(aggregateMonthly([])).toEqual([]);
  });

  it('считает среднюю, осадки, активные температуры и сухие дни', () => {
    const r = aggregateMonthly([
      day('2026-05-01', 8, 0),
      day('2026-05-02', 12, 5.5),
      day('2026-05-03', 10, 0.9), // ровно 10 — не активный; 0.9 мм — сухой
      day('2026-05-04', 20, 1), // 1 мм — уже не сухой
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ month: '2026-05-01', tMean: 12.5, precipitation: 7.4, activeTempSum: 32, dryDays: 2 });
  });

  it('группирует по месяцам и сортирует', () => {
    const r = aggregateMonthly([day('2026-07-01', 25, 0), day('2026-06-30', 20, 2), day('2026-06-01', 18, 0)]);
    expect(r.map((m) => m.month)).toEqual(['2026-06-01', '2026-07-01']);
    expect(r[0].activeTempSum).toBe(38);
  });

  it('пропуски не считаются нулём', () => {
    const r = aggregateMonthly([day('2026-10-01', null, null), day('2026-10-02', 6, 0)]);
    expect(r[0].tMean).toBe(6);
    expect(r[0].dryDays).toBe(1);
  });

  it('месяц без температур -> tMean null', () => {
    expect(aggregateMonthly([day('2026-10-01', null, 3)])[0].tMean).toBeNull();
  });
});

describe('fetchArchive: фолбэк на кэш', () => {
  const region = { id: 'saratov', name: 'Саратовская область', lat: 51.5, lon: 46, timezone: 'Europe/Saratov' } as RegionConfig;
  const cache = {
    source: 'Open-Meteo, архив ERA5 (CC BY 4.0)',
    source_url: 'https://open-meteo.com/',
    updated_at: '2026-10-27',
    demo: false,
    days: [day('2026-01-01', 1, 0), day('2026-01-02', 2, 1), day('2026-01-03', 3, 2)],
  };
  const mockFetch = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('archive-api')) throw new Error('offline');
        return { ok: true, json: async () => cache } as Response;
      }),
    );
  afterEach(() => vi.unstubAllGlobals());

  it('диапазон внутри кэша -> origin cache и нужные дни', async () => {
    mockFetch();
    const r = await fetchArchive(region, '2026-01-02', '2026-01-03');
    expect(r.origin).toBe('cache');
    expect(r.data.map((d) => d.date)).toEqual(['2026-01-02', '2026-01-03']);
  });

  it('диапазон шире кэша -> понятная ошибка, а не пустой массив', async () => {
    mockFetch();
    await expect(fetchArchive(region, '2019-01-01', '2026-01-03')).rejects.toThrow(/офлайн-кэш покрывает только/);
  });
});

import { describe, expect, it } from 'vitest';
import { aggregateMonthly } from './weather';
import type { DailyWeather } from '../types';

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

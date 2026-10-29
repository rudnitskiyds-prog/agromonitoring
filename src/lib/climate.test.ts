import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DataSeries } from '../types';
import {
  dataCutoff,
  growingWindow,
  incompleteMonth,
  monthlyNorm,
  monthRows,
  normOfYears,
  normYearsOf,
  seasonByYear,
  seasonMonthRows,
} from './climate';

/** Синтетика: осадки = месяц × 10 + (год − 2019), 2019-01 … 2026-10; срез 27.10.2026. */
function synth(extra: Partial<DataSeries> = {}): DataSeries {
  const series = [];
  for (let y = 2019; y <= 2026; y++)
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 10) break;
      series.push({ date: `${y}-${String(m).padStart(2, '0')}-01`, value: m * 10 + (y - 2019) });
    }
  return {
    indicator: 'precipitation',
    region: 'saratov',
    crop: null,
    unit: 'мм',
    source: 'Open-Meteo',
    source_url: '',
    updated_at: '2026-10-27',
    frequency: 'month',
    demo: false,
    series,
    ...extra,
  };
}

describe('incompleteMonth и срез данных', () => {
  it('срез раньше конца месяца — месяц неполный', () => {
    expect(incompleteMonth(synth())).toBe('2026-10-01');
  });
  it('дата в note важнее updated_at', () => {
    const s = synth({ updated_at: '2026-11-02', note: 'Данные ERA5 по 2026-10-27 включительно' });
    expect(dataCutoff(s)).toBe('2026-10-27');
    expect(incompleteMonth(s)).toBe('2026-10-01');
  });
  it('срез в последний день месяца или в следующем месяце — всё полное', () => {
    expect(incompleteMonth(synth({ updated_at: '2026-10-31' }))).toBeNull();
    expect(incompleteMonth(synth({ updated_at: '2026-11-05' }))).toBeNull();
    expect(incompleteMonth(synth({ updated_at: 'нет даты' }))).toBeNull();
  });
  it('годы нормы по умолчанию — полные годы до года среза', () => {
    expect(normYearsOf(synth())).toEqual({ from: 2019, to: 2025 });
  });
});

describe('seasonByYear', () => {
  it('сумма и среднее апрель–сентябрь', () => {
    const sum = seasonByYear(synth(), 'sum');
    expect(sum[0]).toEqual({ date: '2019-01-01', value: (4 + 5 + 6 + 7 + 8 + 9) * 10 });
    expect(seasonByYear(synth(), 'mean')[1].value).toBeCloseTo(65 + 1, 9);
    expect(sum.find((p) => p.date === '2026-01-01')!.value).toBe(390 + 6 * 7); // сентябрь полный
  });
  it('неполный месяц в сезоне — значения за год нет', () => {
    const s = seasonByYear(synth(), 'sum', [8, 9, 10]);
    expect(s.find((p) => p.date === '2026-01-01')!.value).toBeNull();
    expect(s.find((p) => p.date === '2025-01-01')!.value).toBe(270 + 18);
  });
  it('пропуск месяца — null', () => {
    const x = synth();
    x.series = x.series.filter((p) => p.date !== '2020-06-01');
    expect(seasonByYear(x, 'sum').find((p) => p.date === '2020-01-01')!.value).toBeNull();
  });
});

describe('normOfYears и monthlyNorm', () => {
  it('normOfYears — среднее годовых точек в диапазоне', () => {
    const pts = seasonByYear(synth(), 'sum');
    expect(normOfYears(pts, { from: 2019, to: 2025 })).toBeCloseTo(390 + 6 * 3, 9);
    expect(normOfYears(pts, { from: 2030, to: 2031 })).toBeNull();
  });
  it('monthlyNorm — среднее календарного месяца, неполный месяц не входит', () => {
    const n = monthlyNorm(synth(), { from: 2019, to: 2026 });
    expect(n.get(7)).toBeCloseTo(70 + 3.5, 9); // 2019–2026
    expect(n.get(10)).toBeCloseTo(100 + 3, 9); // октябрь 2026 неполный — только 2019–2025
    expect(n.get(12)).toBeCloseTo(120 + 3, 9);
    expect([...n.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('seasonMonthRows и monthRows', () => {
  it('строки месяцев против нормы 2019–2025', () => {
    const rows = seasonMonthRows(synth(), 2026);
    expect(rows.map((r) => r.month)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    const jul = rows[3];
    expect(jul).toMatchObject({ date: '2026-07-01', value: 77, norm: 73, incomplete: false });
    expect(jul.deviationPct).toBeCloseTo((77 / 73 - 1) * 100, 9);
    expect(jul.diff).toBeCloseTo(4, 9);
    const oct = rows[6];
    expect(oct.incomplete).toBe(true);
    expect(oct.value).toBe(107);
    expect(oct.deviationPct).toBeNull();
    expect(oct.diff).toBeNull();
  });
  it('окно через Новый год', () => {
    const rows = monthRows(synth(), [{ year: 2025, month: 12 }, { year: 2026, month: 1 }]);
    expect(rows.map((r) => r.date)).toEqual(['2025-12-01', '2026-01-01']);
    expect(rows[0].value).toBe(126);
  });
  it('нет значения — deviation null', () => {
    const rows = seasonMonthRows(synth(), 2027, [7]);
    expect(rows[0].value).toBeNull();
    expect(rows[0].deviationPct).toBeNull();
    expect(rows[0].norm).toBeCloseTo(73, 9);
  });
});

describe('growingWindow', () => {
  it('озимая пшеница на Кубани: ноябрь прошлого года → июль', () => {
    const w = growingWindow('krasnodar', 'wheat', 2026);
    expect(w[0]).toEqual({ year: 2025, month: 11 });
    expect(w[w.length - 1]).toEqual({ year: 2026, month: 7 });
    expect(w).toHaveLength(9);
  });
  it('подсолнечник: май → октябрь того же года', () => {
    const w = growingWindow('krasnodar', 'sunflower', 2026);
    expect(w[0]).toEqual({ year: 2026, month: 5 });
    expect(w[w.length - 1]).toEqual({ year: 2026, month: 10 });
  });
  it('нет календаря — май–октябрь', () => {
    const w = growingWindow('nowhere', 'corn', 2026);
    expect(w.map((x) => x.month)).toEqual([5, 6, 7, 8, 9, 10]);
  });
});

// Сверка на реальном кэше ERA5 (если файл есть): Саратов, осадки 2026.
const real = resolve(__dirname, '../../public/data/precipitation_saratov_month.json');
describe.skipIf(!existsSync(real))('сверка: Саратов, осадки 2026', () => {
  it('июль 28/34 (−16%), август 12/34 (−65%), сентябрь 36/27 (+36%), октябрь неполный', () => {
    const s = JSON.parse(readFileSync(real, 'utf8')) as DataSeries;
    const rows = seasonMonthRows(s, 2026, [7, 8, 9, 10]);
    const r = (x: number | null) => (x === null ? null : Math.round(x));
    expect(rows.map((x) => [r(x.value), r(x.norm), r(x.deviationPct)])).toEqual([
      [28, 34, -16],
      [12, 34, -65],
      [36, 27, 36],
      [8, r(rows[3].norm), null],
    ]);
    expect(rows[3].incomplete).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { DataSeries } from '../types';
import { buildSeasonalProfile, seasonalDeviation, sellerStatus } from './seasonality';

// Известный профиль (среднее = 1): дешевле в уборку (июль–август), дороже весной.
const KNOWN = [1.04, 1.05, 1.06, 1.05, 1.02, 0.98, 0.92, 0.9, 0.95, 1.0, 1.01, 1.02];
const knownMean = KNOWN.reduce((a, b) => a + b, 0) / 12;
const IDX = KNOWN.map((k) => k / knownMean);

/** Синтетика: уровень растёт на 10% в год (инфляция), сезонность — IDX. 2019…2025 полные + 2026 до октября. */
function synthetic(): DataSeries {
  const series = [];
  for (let y = 2019; y <= 2026; y++) {
    const level = 10000 * 1.1 ** (y - 2019);
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 10) break;
      series.push({ date: `${y}-${String(m).padStart(2, '0')}-01`, value: level * IDX[m - 1] });
    }
  }
  return {
    indicator: 'producer_price',
    region: 'krasnodar',
    crop: 'wheat',
    unit: 'руб./т',
    source: 'Тест',
    source_url: 'https://example.org',
    updated_at: '2026-10-01',
    frequency: 'month',
    demo: true,
    series,
  };
}

describe('buildSeasonalProfile', () => {
  const s = synthetic();
  const p = buildSeasonalProfile(s);
  it('берёт последние 5 полных лет, неполный 2026 не входит', () => {
    expect(p.years).toEqual([2021, 2022, 2023, 2024, 2025]);
    expect(p.months).toHaveLength(12);
    expect(p.months.every((m) => m.years === 5)).toBe(true);
    expect(p.crop).toBe('wheat');
    expect(p.source.demo).toBe(true);
  });
  it('восстанавливает известный профиль несмотря на инфляцию', () => {
    p.months.forEach((m, i) => {
      expect(m.month).toBe(i + 1);
      expect(m.index).toBeCloseTo(IDX[i], 9);
      expect(m.min).toBeCloseTo(m.max, 6); // профиль одинаков во все годы
    });
    const avg = p.months.reduce((a, m) => a + m.index, 0) / 12;
    expect(avg).toBeCloseTo(1, 12);
  });
  it('норма в ценах последних 12 месяцев', () => {
    const last12 = s.series.slice(-12).map((x) => x.value as number);
    const base = last12.reduce((a, b) => a + b, 0) / 12;
    expect(p.months[9].normPrice).toBeCloseTo(IDX[9] * base, 6);
  });
  it('years = 3 и пропуски', () => {
    const s2 = synthetic();
    s2.series = s2.series.map((pt) => (pt.date === '2024-05-01' ? { ...pt, value: null } : pt)); // 2024 неполный
    const p3 = buildSeasonalProfile(s2, 3);
    expect(p3.years).toEqual([2022, 2023, 2025]);
  });
  it('нет полных лет — индекс 1', () => {
    const s3 = synthetic();
    s3.series = s3.series.filter((x) => x.date >= '2026-01-01');
    const p0 = buildSeasonalProfile(s3);
    expect(p0.years).toEqual([]);
    expect(p0.months.every((m) => m.index === 1 && m.years === 0)).toBe(true);
  });
  it('недельный ряд сводится к месяцам', () => {
    const s4 = synthetic();
    s4.series = s4.series.flatMap((pt) => [pt, { date: pt.date.slice(0, 8) + '15', value: pt.value }]);
    const p4 = buildSeasonalProfile(s4);
    expect(p4.months[6].index).toBeCloseTo(IDX[6], 9);
  });
});

describe('seasonalDeviation', () => {
  const s = synthetic();
  const p = buildSeasonalProfile(s);
  it('по последней точке', () => {
    const d = seasonalDeviation(s, p);
    expect(d.date).toBe('2026-10-01');
    expect(d.month).toBe(10);
    expect(d.normPrice).toBeCloseTo(p.months[9].normPrice, 9);
    expect(d.deviationPct).toBeCloseTo((d.currentPrice / d.normPrice - 1) * 100, 9);
  });
  it('crop берётся из series.crop; null — поля нет', () => {
    expect(seasonalDeviation(s, p).crop).toBe('wheat');
    const d = seasonalDeviation({ ...s, crop: null }, p);
    expect('crop' in d).toBe(false);
  });
  it('статусы для продавца: +6% → better, −6% → worse, +2% → normal', () => {
    const mkCur = (k: number) => {
      const s2 = synthetic();
      s2.series.push({ date: '2026-11-01', value: p.months[10].normPrice * k });
      return seasonalDeviation(s2, p);
    };
    const hi = mkCur(1.06);
    expect(hi.deviationPct).toBeCloseTo(6, 9);
    expect(hi.status).toBe('better');
    expect(mkCur(0.94).status).toBe('worse');
    expect(mkCur(1.02).status).toBe('normal');
    expect(mkCur(1.029).status).toBe('normal'); // в пределах порога — норма
    expect(mkCur(1.031).status).toBe('better');
  });
  it('на дату и свой порог', () => {
    const d = seasonalDeviation(s, p, { date: '2026-03-20', thresholdPct: 10 });
    expect(d.date).toBe('2026-03-01');
    expect(d.month).toBe(3);
  });
  it('sellerStatus', () => {
    expect(sellerStatus(3.01)).toBe('better');
    expect(sellerStatus(-3.01)).toBe('worse');
    expect(sellerStatus(0)).toBe('normal');
  });
  it('пустой ряд → ошибка', () => {
    expect(() => seasonalDeviation({ ...s, series: [] }, p)).toThrow();
  });
});

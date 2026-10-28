import { describe, expect, it } from 'vitest';
import type { CropPlan, DataSeries, FarmProfile, PeriodState } from '../types';
import {
  applyWhatIf,
  applyWhatIfFarm,
  computeCropEconomics,
  computeFarmEconomics,
  factorAnalysis,
  marginPerHaOf,
  NO_SHIFT,
  periodStateAt,
  sensitivity,
} from './finance';
import { changePct, monthAgo, valueAt } from './series';

const A = (value: number) => ({ value, assumption: false });

// Ручной пример: 50 ц/га = 5 т/га; затраты 4000+9000+3000+60×70+6000 = 26 200 ₽/га.
const plan: CropPlan = {
  crop: 'wheat',
  areaHa: 800,
  yieldCha: A(50),
  costs: { seeds: A(4000), fertilizers: A(9000), plantProtection: A(3000), fuelLitersPerHa: A(60), other: A(6000) },
};
const prices = { pricePerT: 15000, dieselPerL: 70 };

describe('computeCropEconomics', () => {
  const e = computeCropEconomics(plan, prices);
  it('выручка, затраты, себестоимость и маржа на ручном примере', () => {
    expect(e.yieldTPerHa).toBe(5);
    expect(e.revenuePerHa).toBe(75000);
    expect(e.costBreakdown.fuel).toBe(4200);
    expect(e.costPerHa).toBe(26200);
    expect(e.costPerT).toBeCloseTo(5240, 9);
    expect(e.marginPerHa).toBe(48800);
    expect(e.profit).toBe(48800 * 800);
    expect(e.fuelSharePct).toBeCloseTo((4200 / 26200) * 100, 9);
  });
  it('безубыточная цена = себестоимость тонны', () => {
    expect(e.breakevenPricePerT).toBe(e.costPerT);
    // при безубыточной цене маржа = 0
    expect(computeCropEconomics(plan, { ...prices, pricePerT: e.breakevenPricePerT! }).marginPerHa).toBeCloseTo(0, 6);
  });
  it('безубыточная урожайность, ц/га', () => {
    expect(e.breakevenYieldCha).toBeCloseTo((26200 / 15000) * 10, 9);
    const atBe = { ...plan, yieldCha: A(e.breakevenYieldCha!) };
    expect(computeCropEconomics(atBe, prices).marginPerHa).toBeCloseTo(0, 6);
  });
  it('нулевая урожайность → себестоимость и безубыточная цена null', () => {
    const z = computeCropEconomics({ ...plan, yieldCha: A(0) }, prices);
    expect(z.costPerT).toBeNull();
    expect(z.breakevenPricePerT).toBeNull();
    expect(z.revenuePerHa).toBe(0);
    expect(z.marginPerHa).toBe(-26200);
    expect(z.breakevenYieldCha).not.toBeNull();
  });
  it('нулевая цена → безубыточная урожайность null', () => {
    const z = computeCropEconomics(plan, { ...prices, pricePerT: 0 });
    expect(z.breakevenYieldCha).toBeNull();
    expect(z.costPerT).not.toBeNull();
  });
  it('нулевые затраты → доля топлива 0, без NaN', () => {
    const zc = { ...plan, costs: { seeds: A(0), fertilizers: A(0), plantProtection: A(0), fuelLitersPerHa: A(0), other: A(0) } };
    const z = computeCropEconomics(zc, prices);
    expect(z.fuelSharePct).toBe(0);
    expect(z.costPerT).toBe(0);
  });
});

const profile: FarmProfile = {
  version: 1,
  name: 'Тест',
  region: 'krasnodar',
  isDemo: false,
  updatedAt: '2026-10-01T00:00:00Z',
  crops: [plan, { ...plan, crop: 'sunflower', areaHa: 400, yieldCha: A(25) }],
};
const farmPrices = { wheat: prices, sunflower: { pricePerT: 38000, dieselPerL: 70 } };

describe('computeFarmEconomics', () => {
  it('суммирует культуры и считает средневзвешенную маржу', () => {
    const f = computeFarmEconomics(profile, farmPrices);
    const w = computeCropEconomics(profile.crops[0], farmPrices.wheat);
    const s = computeCropEconomics(profile.crops[1], farmPrices.sunflower);
    expect(f.totalAreaHa).toBe(1200);
    expect(f.profit).toBeCloseTo(w.profit + s.profit, 6);
    expect(f.marginPerHa).toBeCloseTo((w.profit + s.profit) / 1200, 6);
  });
  it('культура без цен пропускается', () => {
    const f = computeFarmEconomics(profile, { wheat: prices });
    expect(f.crops).toHaveLength(1);
    expect(f.totalAreaHa).toBe(800);
  });
  it('пустое хозяйство — нули без NaN', () => {
    const f = computeFarmEconomics(profile, {});
    expect(f.marginPerHa).toBe(0);
    expect(f.profit).toBe(0);
  });
});

// Детерминированный ГПСЧ для «случайных» наборов.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('factorAnalysis — цепные подстановки', () => {
  const base: PeriodState = { label: 'Сентябрь', pricePerT: 15000, yieldCha: 50, dieselPerL: 70, fuelLitersPerHa: 60, nonFuelCostPerHa: 22000 };
  const cur: PeriodState = { label: 'Октябрь', pricePerT: 14550, yieldCha: 50, dieselPerL: 72.8, fuelLitersPerHa: 60, nonFuelCostPerHa: 22000 };

  it('ручной пример: цена −3%, солярка +4%', () => {
    const r = factorAnalysis(base, cur, 800, 'wheat');
    const [p, y, d, o] = r.contributions;
    expect(r.contributions.map((c) => c.factor)).toEqual(['price', 'yield', 'diesel', 'otherCosts']);
    expect(p.effectPerHa).toBeCloseTo(-450 * 5, 9); // −2 250 ₽/га
    expect(p.changePct).toBeCloseTo(-3, 9);
    expect(y.effectPerHa).toBe(0);
    expect(d.effectPerHa).toBeCloseTo(-2.8 * 60, 9); // −168 ₽/га
    expect(d.changePct).toBeCloseTo(4, 9);
    expect(o.effectPerHa).toBeCloseTo(0, 9);
    expect(p.effectTotal).toBeCloseTo(-2250 * 800, 6);
    expect(r.totalChangePerHa).toBeCloseTo(-2418, 9);
    expect(r.totalChange).toBeCloseTo(-2418 * 800, 6);
    expect(Math.abs(r.residualPerHa)).toBeLessThan(1e-6);
  });

  it('порядок подстановок: эффект урожайности считается при новой цене', () => {
    const c2 = { ...base, pricePerT: 20000, yieldCha: 60 };
    const r = factorAnalysis(base, c2, 1, 'wheat');
    expect(r.contributions[0].effectPerHa).toBeCloseTo(5000 * 5, 9);
    expect(r.contributions[1].effectPerHa).toBeCloseTo(1 * 20000, 9);
  });

  it('сумма вкладов = общему изменению на 200 случайных наборах', () => {
    const r = rng(42);
    const st = (): PeriodState => ({
      label: 'x',
      pricePerT: 5000 + r() * 40000,
      yieldCha: r() < 0.1 ? 0 : r() * 80,
      dieselPerL: 50 + r() * 40,
      fuelLitersPerHa: 30 + r() * 80,
      nonFuelCostPerHa: 5000 + r() * 40000,
    });
    for (let i = 0; i < 200; i++) {
      const b = st();
      const c = st();
      const area = Math.round(r() * 5000);
      const fa = factorAnalysis(b, c, area, 'wheat');
      const sum = fa.contributions.reduce((s, x) => s + x.effectPerHa, 0);
      const sumTotal = fa.contributions.reduce((s, x) => s + x.effectTotal, 0);
      expect(Math.abs(fa.residualPerHa)).toBeLessThan(1e-6);
      expect(sum).toBeCloseTo(fa.currentMarginPerHa - fa.baseMarginPerHa, 6);
      expect(sumTotal).toBeCloseTo(fa.totalChange, 3);
      expect(fa.baseMarginPerHa).toBeCloseTo(marginPerHaOf(b), 9);
    }
  });

  it('изменение фактора при нулевой базе → changePct null', () => {
    const r = factorAnalysis({ ...base, yieldCha: 0 }, cur, 1, 'wheat');
    expect(r.contributions[1].changePct).toBeNull();
    expect(Math.abs(r.residualPerHa)).toBeLessThan(1e-6);
  });

  it('изменение расхода топлива попадает в «прочие затраты», невязка 0', () => {
    const r = factorAnalysis(base, { ...cur, fuelLitersPerHa: 70 }, 1, 'wheat');
    expect(r.contributions[3].effectPerHa).toBeCloseTo(-10 * 72.8, 9);
    expect(Math.abs(r.residualPerHa)).toBeLessThan(1e-6);
  });
});

const ser = (points: Array<[string, number | null]>, extra: Partial<DataSeries> = {}): DataSeries => ({
  indicator: 'producer_price',
  region: 'krasnodar',
  crop: 'wheat',
  unit: 'руб./т',
  source: 'Тест',
  source_url: '',
  updated_at: '2026-10-01',
  frequency: 'month',
  demo: true,
  series: points.map(([date, value]) => ({ date, value })),
  ...extra,
});

describe('series', () => {
  const s = ser([
    ['2026-07-01', 14000],
    ['2026-08-01', null],
    ['2026-09-01', 15000],
    ['2026-10-01', 14550],
  ]);
  it('valueAt — последнее непустое ≤ date', () => {
    expect(valueAt(s)).toEqual({ date: '2026-10-01', value: 14550 });
    expect(valueAt(s, '2026-08-15')).toEqual({ date: '2026-07-01', value: 14000 });
    expect(valueAt(s, '2026-09-01')).toEqual({ date: '2026-09-01', value: 15000 });
    expect(valueAt(s, '2026-01-01')).toBeNull();
  });
  it('changePct', () => {
    expect(changePct(s, '2026-09-01', '2026-10-01')).toBeCloseTo(-3, 9);
    expect(changePct(s, '2020-01-01', '2026-10-01')).toBeNull();
    expect(changePct(ser([['2026-01-01', 0], ['2026-02-01', 5]]), '2026-01-01', '2026-02-01')).toBeNull();
  });
});

describe('periodStateAt', () => {
  const data = {
    price: ser([['2026-09-01', 15000], ['2026-10-01', 14550]]),
    diesel: ser([['2026-09-29', 70], ['2026-10-06', 71], ['2026-10-27', 72.8]], { indicator: 'diesel_price', crop: null, frequency: 'week' }),
    yield: ser([['2024-01-01', 48], ['2025-01-01', 41]], { indicator: 'yield', frequency: 'year' }),
  };
  it('цена и дизель — на дату, урожайность и затраты — из плана', () => {
    const s = periodStateAt(plan, data, '2026-10-28', { label: 'Октябрь 2026' });
    expect(s).toEqual({ label: 'Октябрь 2026', pricePerT: 14550, yieldCha: 50, dieselPerL: 72.8, fuelLitersPerHa: 60, nonFuelCostPerHa: 22000 });
    expect(periodStateAt(plan, data, '2026-09-30').dieselPerL).toBe(70);
  });
  it('yieldFromData — урожайность из ряда', () => {
    expect(periodStateAt(plan, data, '2026-10-28', { yieldFromData: true }).yieldCha).toBe(41);
    const noYield = { ...data, yield: { ...data.yield, series: [] } };
    expect(periodStateAt(plan, noYield, '2026-10-28', { yieldFromData: true }).yieldCha).toBe(50); // нет в ряду → план
  });
  it('нет цены на дату → понятная ошибка', () => {
    expect(() => periodStateAt(plan, data, '2020-01-01')).toThrow(/Нет цены продукции/);
  });
});

describe('applyWhatIf и sensitivity', () => {
  it('нулевые сдвиги = база', () => {
    expect(applyWhatIf(plan, prices, NO_SHIFT)).toEqual(computeCropEconomics(plan, prices));
    expect(applyWhatIfFarm(profile, farmPrices, NO_SHIFT)).toEqual(computeFarmEconomics(profile, farmPrices));
  });
  it('сдвиги применяются долями', () => {
    const e = applyWhatIf(plan, prices, { price: 0.1, yield: -0.2, diesel: 0.3 });
    expect(e.pricePerT).toBeCloseTo(16500, 9);
    expect(e.yieldTPerHa).toBeCloseTo(4, 9);
    expect(e.dieselPerL).toBeCloseTo(91, 9);
    expect(e.marginPerHa).toBeCloseTo(4 * 16500 - (22000 + 60 * 91), 6);
  });
  it('торнадо: база посередине, цена и урожайность симметричны, солярка обратна', () => {
    const bars = sensitivity(profile, farmPrices);
    const base = computeFarmEconomics(profile, farmPrices).profit;
    expect(bars).toHaveLength(3);
    for (const b of bars) expect(b.baseProfit).toBeCloseTo(base, 6);
    const price = bars.find((b) => b.factor === 'price')!;
    const diesel = bars.find((b) => b.factor === 'diesel')!;
    expect(price.highProfit).toBeGreaterThan(base);
    expect(price.lowProfit).toBeLessThan(base);
    expect(diesel.lowProfit).toBeGreaterThan(base); // солярка −30% — прибыль выше
    const revenue = computeFarmEconomics(profile, farmPrices).revenue;
    expect(price.highProfit - base).toBeCloseTo(0.3 * revenue, 4);
    // сортировка по размаху
    const spans = bars.map((b) => Math.abs(b.highProfit - b.lowProfit));
    expect([...spans].sort((x, y) => y - x)).toEqual(spans);
    // цена и урожай действуют на выручку одинаково — столбцы равны
    const yld = bars.find((b) => b.factor === 'yield')!;
    expect(yld.highProfit).toBeCloseTo(price.highProfit, 6);
    expect(yld.lowProfit).toBeCloseTo(price.lowProfit, 6);
    const r10 = sensitivity(profile, farmPrices, 0.1).find((b) => b.factor === 'price')!;
    expect(r10.highProfit - base).toBeCloseTo(0.1 * revenue, 4);
  });
});

describe('monthAgo', () => {
  it('тот же день месяцем раньше', () => {
    expect(monthAgo('2026-10-26')).toBe('2026-09-26');
    expect(monthAgo('2026-10-26', 3)).toBe('2026-07-26');
  });
  it('нет такого дня — последний день месяца', () => {
    expect(monthAgo('2026-03-31')).toBe('2026-02-28');
    expect(monthAgo('2026-05-31')).toBe('2026-04-30');
  });
  it('переход через год', () => {
    expect(monthAgo('2026-01-15')).toBe('2025-12-15');
    expect(monthAgo('2026-02-10', 14)).toBe('2024-12-10');
  });
  it('високосный год', () => {
    expect(monthAgo('2024-03-31')).toBe('2024-02-29');
    expect(monthAgo('2025-02-28', 12)).toBe('2024-02-28');
    expect(monthAgo('2000-03-30')).toBe('2000-02-29');
    expect(monthAgo('2100-03-30')).toBe('2100-02-28');
  });
});

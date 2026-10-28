// Финансовый слой (раздел 7). Владелец — finance-modeler.
//
// Формулы (на 1 га, урожайность в т/га = ц/га / 10):
//   выручка        = урожайность × цена
//   затраты        = семена + удобрения + СЗР + топливо_л_га × цена_дизеля + прочие
//   себестоимость т = затраты / урожайность          (null при нулевой урожайности)
//   маржа          = выручка − затраты; прибыль = маржа × площадь
//   безубыточная цена = себестоимость тонны; безубыточная урожайность = затраты / цена (null при цене 0)
//
// Факторный анализ — цепные подстановки в порядке цена → урожайность → солярка → прочие затраты.
import type {
  ApplyWhatIf,
  ComputeCropEconomics,
  ComputeFarmEconomics,
  CostBreakdown,
  CostsPerHa,
  CropEconomics,
  CropId,
  CropPlan,
  FactorAnalysisFn,
  FactorContribution,
  FactorId,
  FarmEconomics,
  FarmProfile,
  MarketPrices,
  PeriodState,
  PeriodStateAt,
  Sensitivity,
  TornadoBar,
  WhatIfShifts,
} from '../types';
import { numberAt } from './series';

/** ц/га → т/га */
export const chaToT = (cha: number): number => cha / 10;

/** Затраты без топлива, ₽/га: семена + удобрения + СЗР + прочие. */
export function nonFuelCostPerHa(costs: CostsPerHa): number {
  return costs.seeds.value + costs.fertilizers.value + costs.plantProtection.value + costs.other.value;
}

/** Маржа на гектар по состоянию периода, ₽/га. */
export function marginPerHaOf(s: Pick<PeriodState, 'pricePerT' | 'yieldCha' | 'dieselPerL' | 'fuelLitersPerHa' | 'nonFuelCostPerHa'>): number {
  return chaToT(s.yieldCha) * s.pricePerT - (s.nonFuelCostPerHa + s.fuelLitersPerHa * s.dieselPerL);
}

export const computeCropEconomics: ComputeCropEconomics = (plan, prices) => {
  const yieldTPerHa = chaToT(plan.yieldCha.value);
  const { pricePerT, dieselPerL } = prices;
  const costBreakdown: CostBreakdown = {
    seeds: plan.costs.seeds.value,
    fertilizers: plan.costs.fertilizers.value,
    plantProtection: plan.costs.plantProtection.value,
    fuel: plan.costs.fuelLitersPerHa.value * dieselPerL,
    other: plan.costs.other.value,
  };
  const costPerHa =
    costBreakdown.seeds + costBreakdown.fertilizers + costBreakdown.plantProtection + costBreakdown.fuel + costBreakdown.other;
  const revenuePerHa = yieldTPerHa * pricePerT;
  const marginPerHa = revenuePerHa - costPerHa;
  // Явная обработка деления на ноль: нет урожая — нет себестоимости тонны; нет цены — нет безубыточной урожайности.
  const costPerT = yieldTPerHa > 0 ? costPerHa / yieldTPerHa : null;
  const breakevenYieldCha = pricePerT > 0 ? (costPerHa / pricePerT) * 10 : null;
  return {
    crop: plan.crop,
    areaHa: plan.areaHa,
    yieldTPerHa,
    pricePerT,
    dieselPerL,
    revenuePerHa,
    costPerHa,
    costBreakdown,
    fuelSharePct: costPerHa > 0 ? (costBreakdown.fuel / costPerHa) * 100 : 0,
    costPerT,
    marginPerHa,
    profit: marginPerHa * plan.areaHa,
    breakevenPricePerT: costPerT,
    breakevenYieldCha,
  };
};

/** Культуры без цен в `prices` пропускаются (по ним нечего считать) — в итог не входят. */
export const computeFarmEconomics: ComputeFarmEconomics = (profile, prices) => {
  const crops: CropEconomics[] = [];
  for (const plan of profile.crops) {
    const p = prices[plan.crop];
    if (p) crops.push(computeCropEconomics(plan, p));
  }
  return summarizeFarm(crops);
};

function summarizeFarm(crops: CropEconomics[]): FarmEconomics {
  let totalAreaHa = 0;
  let revenue = 0;
  let cost = 0;
  for (const c of crops) {
    totalAreaHa += c.areaHa;
    revenue += c.revenuePerHa * c.areaHa;
    cost += c.costPerHa * c.areaHa;
  }
  const profit = revenue - cost;
  return { crops, totalAreaHa, revenue, cost, profit, marginPerHa: totalAreaHa > 0 ? profit / totalAreaHa : 0 };
}

const pct = (from: number, to: number): number | null => (from === 0 ? null : (to / from - 1) * 100);

/**
 * Цепные подстановки: M0 → (цена) → (урожайность) → (цена солярки) → (прочие затраты) = M1.
 * На шаге «солярка» меняется цена дизеля при базовом расходе л/га; на шаге «прочие затраты»
 * меняются затраты без топлива и расход л/га (если он менялся). Последний шаг приходит ровно в M1,
 * поэтому сумма вкладов = общему изменению (невязка — только ошибка округления float).
 */
export const factorAnalysis: FactorAnalysisFn = (base, current, areaHa, crop) => {
  const m0 = marginPerHaOf(base);
  const s1 = { ...base, pricePerT: current.pricePerT };
  const s2 = { ...s1, yieldCha: current.yieldCha };
  const s3 = { ...s2, dieselPerL: current.dieselPerL };
  const m1v = marginPerHaOf(s1);
  const m2v = marginPerHaOf(s2);
  const m3v = marginPerHaOf(s3);
  const mEnd = marginPerHaOf(current);

  const mk = (factor: FactorId, from: number, to: number, effectPerHa: number): FactorContribution => ({
    factor,
    from,
    to,
    changePct: pct(from, to),
    effectPerHa,
    effectTotal: effectPerHa * areaHa,
  });

  const contributions: FactorContribution[] = [
    mk('price', base.pricePerT, current.pricePerT, m1v - m0),
    mk('yield', base.yieldCha, current.yieldCha, m2v - m1v),
    mk('diesel', base.dieselPerL, current.dieselPerL, m3v - m2v),
    mk('otherCosts', base.nonFuelCostPerHa, current.nonFuelCostPerHa, mEnd - m3v),
  ];
  const totalChangePerHa = mEnd - m0;
  const sum = contributions.reduce((a, c) => a + c.effectPerHa, 0);
  return {
    crop,
    areaHa,
    base,
    current,
    baseMarginPerHa: m0,
    currentMarginPerHa: mEnd,
    contributions,
    totalChangePerHa,
    totalChange: totalChangePerHa * areaHa,
    residualPerHa: totalChangePerHa - sum,
  };
};

/**
 * Цена и дизель — последнее известное значение ≤ date; урожайность — из плана,
 * а при yieldFromData — из ряда (если в ряду нет значения ≤ date — из плана).
 * Нет цены или дизеля на дату → Error (не подставляем выдуманных значений).
 */
export const periodStateAt: PeriodStateAt = (plan, data, date, opts = {}) => {
  const price = numberAt(data.price, date);
  const diesel = numberAt(data.diesel, date);
  if (!price) throw new Error(`Нет цены продукции (${plan.crop}) на дату ${date} и ранее`);
  if (!diesel) throw new Error(`Нет цены дизтоплива на дату ${date} и ранее`);
  let yieldCha = plan.yieldCha.value;
  if (opts.yieldFromData) {
    const y = numberAt(data.yield, date);
    if (y) yieldCha = y.value;
  }
  return {
    label: opts.label ?? date,
    pricePerT: price.value,
    yieldCha,
    dieselPerL: diesel.value,
    fuelLitersPerHa: plan.costs.fuelLitersPerHa.value,
    nonFuelCostPerHa: nonFuelCostPerHa(plan.costs),
  };
};

/** План с урожайностью, умноженной на (1 + сдвиг). */
function shiftPlanYield(plan: CropPlan, yieldShift: number): CropPlan {
  return { ...plan, yieldCha: { ...plan.yieldCha, value: plan.yieldCha.value * (1 + yieldShift) } };
}

function shiftPrices(prices: MarketPrices, s: WhatIfShifts): MarketPrices {
  return { pricePerT: prices.pricePerT * (1 + s.price), dieselPerL: prices.dieselPerL * (1 + s.diesel) };
}

/** Сдвиги — доли (−0.3 … +0.3) к цене продукции, урожайности и цене дизеля. */
export const applyWhatIf: ApplyWhatIf = (plan, prices, shifts) =>
  computeCropEconomics(shiftPlanYield(plan, shifts.yield), shiftPrices(prices, shifts));

/** Экономика всего хозяйства при одинаковых сдвигах по всем культурам. */
export function applyWhatIfFarm(
  profile: FarmProfile,
  prices: Partial<Record<CropId, MarketPrices>>,
  shifts: WhatIfShifts,
): FarmEconomics {
  const crops: CropEconomics[] = [];
  for (const plan of profile.crops) {
    const p = prices[plan.crop];
    if (p) crops.push(applyWhatIf(plan, p, shifts));
  }
  return summarizeFarm(crops);
}

export const NO_SHIFT: WhatIfShifts = { price: 0, yield: 0, diesel: 0 };

/** Торнадо: прибыль хозяйства при −range и +range по каждому фактору; сортировка по размаху (убыв.). */
export const sensitivity: Sensitivity = (profile, prices, range = 0.3) => {
  const baseProfit = applyWhatIfFarm(profile, prices, NO_SHIFT).profit;
  const factors: TornadoBar['factor'][] = ['price', 'yield', 'diesel'];
  return factors
    .map((factor) => ({
      factor,
      lowProfit: applyWhatIfFarm(profile, prices, { ...NO_SHIFT, [factor]: -range }).profit,
      highProfit: applyWhatIfFarm(profile, prices, { ...NO_SHIFT, [factor]: range }).profit,
      baseProfit,
    }))
    .sort((a, b) => Math.abs(b.highProfit - b.lowProfit) - Math.abs(a.highProfit - a.lowProfit));
};

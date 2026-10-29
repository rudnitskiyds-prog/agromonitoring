// Данные и модель экрана «Мой бизнес сегодня» (и «Что если», витрины): только склейка функций lib,
// своих формул здесь нет. Загрузка — через связующие хуки src/hooks/useData.ts.
import { useMemo } from 'react';
import { useSeriesList } from '../../hooks/useData';
import { sourceOf } from '../../lib/data';
import { CHANGE_NOISE_PCT } from '../../lib/signals';
import { computeFarmEconomics, factorAnalysis, periodStateAt } from '../../lib/finance';
import { monthAgo, numberAt } from '../../lib/series';
import type {
  CropId,
  CropPlan,
  DataSeries,
  FactorAnalysis,
  FactorId,
  FarmEconomics,
  FarmProfile,
  MarketData,
  MarketPrices,
  SeriesKey,
  SignalStatus,
  SourceRef,
} from '../../types';

export type Period = 'month' | 'year';

export interface CropMarket {
  plan: CropPlan;
  data: MarketData;
}

export interface FarmMarket {
  crops: CropMarket[];
  diesel: DataSeries;
  /** Дата сравнения — последняя точка ряда дизеля региона */
  date: string;
  /** Цены на дату: цена по культуре, дизель общий (periodStateAt) */
  prices: Partial<Record<CropId, MarketPrices>>;
  sources: { price: SourceRef; diesel: SourceRef; yield: SourceRef; all: SourceRef[] };
}

function keysFor(profile: FarmProfile): SeriesKey[] {
  const region = profile.region;
  return [
    { indicator: 'diesel_price', region, frequency: 'week' },
    ...profile.crops.flatMap((c): SeriesKey[] => [
      { indicator: 'producer_price', region, crop: c.crop, frequency: 'month' },
      { indicator: 'yield', region, crop: c.crop, frequency: 'year' },
    ]),
  ];
}

/** Главная культура хозяйства — по наибольшей площади. */
export function mainCrop(profile: FarmProfile): CropId | null {
  return [...profile.crops].sort((a, b) => b.areaHa - a.areaHa)[0]?.crop ?? null;
}

/** Ряды региона профиля: дизель + цена и урожайность по каждой культуре. */
export function useFarmMarket(profile: FarmProfile) {
  const keys = useMemo(() => keysFor(profile), [profile]);
  const state = useSeriesList(keys);
  const market = useMemo<FarmMarket | null>(() => {
    if (state.status !== 'ready') return null;
    const [diesel, ...rest] = state.data;
    const last = numberAt(diesel);
    if (!last) return null;
    const crops: CropMarket[] = profile.crops.map((plan, i) => ({
      plan,
      data: { price: rest[i * 2], yield: rest[i * 2 + 1], diesel },
    }));
    const prices: FarmMarket['prices'] = {};
    for (const c of crops) {
      try {
        const s = periodStateAt(c.plan, c.data, last.date);
        prices[c.plan.crop] = { pricePerT: s.pricePerT, dieselPerL: s.dieselPerL };
      } catch {
        /* нет цены на дату — культура не попадёт в расчёт */
      }
    }
    const main = mainCrop(profile);
    const mainData = crops.find((c) => c.plan.crop === main)?.data ?? crops[0]?.data;
    const all = [diesel, ...rest].map(sourceOf);
    return {
      crops,
      diesel,
      date: last.date,
      prices,
      sources: {
        diesel: sourceOf(diesel),
        price: mainData ? sourceOf(mainData.price) : sourceOf(diesel),
        yield: mainData ? sourceOf(mainData.yield) : sourceOf(diesel),
        all,
      },
    };
  }, [state, profile]);
  return { status: state.status, error: state.status === 'error' ? state.error : null, market };
}

export interface TodayModel {
  period: Period;
  baseDate: string;
  date: string;
  analyses: FactorAnalysis[];
  /** Сумма изменений прибыли по культурам, ₽ */
  totalChange: number;
  /** Сумма вкладов фактора по всем культурам, ₽ */
  factorTotals: Record<FactorId, number>;
  totalAreaHa: number;
  econ: FarmEconomics;
}

/** Факторный анализ по каждой культуре: база — тот же день месяц/год назад (monthAgo). */
export function buildTodayModel(profile: FarmProfile, market: FarmMarket, period: Period): TodayModel {
  const date = market.date;
  const baseDate = monthAgo(date, period === 'month' ? 1 : 12);
  const yieldFromData = period === 'year';
  const analyses: FactorAnalysis[] = [];
  for (const { plan, data } of market.crops) {
    try {
      const base = periodStateAt(plan, data, baseDate, { yieldFromData });
      const cur = periodStateAt(plan, data, date, { yieldFromData });
      analyses.push(factorAnalysis(base, cur, plan.areaHa, plan.crop));
    } catch {
      /* нет данных на одну из дат — культура пропускается, страница это покажет */
    }
  }
  const factorTotals: Record<FactorId, number> = { price: 0, yield: 0, diesel: 0, otherCosts: 0 };
  for (const a of analyses) for (const c of a.contributions) factorTotals[c.factor] += c.effectTotal;
  return {
    period,
    baseDate,
    date,
    analyses,
    totalChange: analyses.reduce((s, a) => s + a.totalChange, 0),
    factorTotals,
    totalAreaHa: profile.crops.reduce((s, c) => s + c.areaHa, 0),
    econ: computeFarmEconomics(profile, market.prices),
  };
}

/** Статус фактора для карточки: изменение в пределах шума — норма, иначе по знаку рублёвого эффекта. */
export function factorStatus(changePct: number | null, effect: number): SignalStatus {
  if (changePct === null || Math.abs(changePct) < CHANGE_NOISE_PCT || effect === 0) return 'normal';
  return effect > 0 ? 'better' : 'worse';
}

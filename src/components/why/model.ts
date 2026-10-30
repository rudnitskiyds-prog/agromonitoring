// Связка страницы «Почему изменилась прибыль»: выбор из query, план культуры, состояния сезонов.
// Формулы — только из src/lib/finance.ts; здесь лишь выбор дат и рядов.
import { CROPS, REGIONS } from '../../config/regions';
import { factorAnalysis, periodStateAt } from '../../lib/finance';
import { alignedSeasonDate, numberAt, validPoints } from '../../lib/series';
import { formatDate } from '../../lib/format';
import { buildDefaultPlan } from '../../store/farm';
import type { CropId, CropPlan, DataSeries, FactorAnalysis, FactorId, FarmProfile, GeoScope, MarketData, RegionId } from '../../types';

export type DrillStep = 'indicator' | 'dynamics' | 'region' | 'factor';
export const DRILL_STEPS: DrillStep[] = ['indicator', 'dynamics', 'region', 'factor'];
export const FACTOR_IDS: FactorId[] = ['price', 'yield', 'diesel', 'otherCosts'];

/** Цена и солярка берутся на одну и ту же дату каждого сезона — 1 октября (после уборки, начало продаж). */
export const SEASON_DATE_MMDD = '10-01';
export const seasonDate = (year: number) => `${year}-${SEASON_DATE_MMDD}`;

/** Площадь примера, когда культуры нет в профиле. */
export const EXAMPLE_AREA_HA = 1000;

export interface WhySelection {
  region: RegionId;
  crop: CropId;
  from: number | null;
  to: number | null;
  factor: FactorId | null;
  step: DrillStep;
}

const isCrop = (v: string | null): v is CropId => v !== null && v in CROPS;
const isFactor = (v: string | null): v is FactorId => v !== null && (FACTOR_IDS as string[]).includes(v);
const isStep = (v: string | null): v is DrillStep => v !== null && (DRILL_STEPS as string[]).includes(v);

/** Главная культура профиля — с наибольшей площадью. */
export function mainCrop(profile: FarmProfile): CropId {
  return [...profile.crops].sort((a, b) => b.areaHa - a.areaHa)[0]?.crop ?? 'wheat';
}

export function readSelection(search: string, profile: FarmProfile): WhySelection {
  const q = new URLSearchParams(search);
  const r = q.get('region');
  const region = r && REGIONS[r] ? r : REGIONS[profile.region] ? profile.region : Object.keys(REGIONS)[0];
  const c = q.get('crop');
  const crop = isCrop(c) ? c : mainCrop(profile);
  const num = (k: string) => {
    const v = q.get(k);
    const n = v === null ? NaN : Number(v);
    return Number.isInteger(n) ? n : null;
  };
  const f = q.get('factor');
  const s = q.get('step');
  return { region, crop, from: num('from'), to: num('to'), factor: isFactor(f) ? f : null, step: isStep(s) ? s : 'indicator' };
}

/** План для расчёта: из профиля, если регион и культура совпадают, иначе пример на 1 000 га. */
export function planFor(profile: FarmProfile, region: RegionId, crop: CropId): { plan: CropPlan; fromProfile: boolean } {
  const own = profile.region === region ? profile.crops.find((p) => p.crop === crop) : undefined;
  if (own && own.areaHa > 0) return { plan: own, fromProfile: true };
  return { plan: buildDefaultPlan(region, crop, EXAMPLE_AREA_HA), fromProfile: false };
}

/** Год сезона доступен, если на его дату есть цена, солярка и урожайность за этот год. */
export function availableYears(data: MarketData): number[] {
  const years = validPoints(data.yield.series).map((p) => Number(p.date.slice(0, 4)));
  return years.filter((y) => {
    const d = seasonDate(y);
    // Каждая точка — из своего сезона: цену или солярку прошлого года за этот сезон не выдаём.
    // Цена — любой месяц этого года не позже даты сезона (пару выравнивает alignedSeasonDate).
    const sameYear = (p: { date: string } | null) => p !== null && p.date.startsWith(String(y));
    return sameYear(numberAt(data.price, d)) && sameYear(numberAt(data.diesel, d)) && sameYear(numberAt(data.yield, d));
  });
}

export interface WhyModel {
  plan: CropPlan;
  fromProfile: boolean;
  years: number[];
  from: number;
  to: number;
  /** Даты сравнения: один и тот же месяц цены в обоих сезонах (alignedSeasonDate) */
  dates: { from: string; to: string };
  analysis: FactorAnalysis;
}

export type WhyModelResult =
  | { ok: true; model: WhyModel }
  | { ok: false; reason: 'noYears' | 'same' | 'noAligned'; years: number[]; plan: CropPlan; fromProfile: boolean };

export function buildModel(
  sel: WhySelection,
  profile: FarmProfile,
  data: MarketData,
): WhyModelResult {
  const { plan, fromProfile } = planFor(profile, sel.region, sel.crop);
  const years = availableYears(data);
  if (years.length < 2) return { ok: false, reason: 'noYears', years, plan, fromProfile };
  const last = years[years.length - 1];
  const to = sel.to !== null && years.includes(sel.to) ? sel.to : last;
  const prev = years.filter((y) => y < to).pop() ?? years[0];
  const from = sel.from !== null && years.includes(sel.from) ? sel.from : prev;
  if (from === to) return { ok: false, reason: 'same', years, plan, fromProfile };
  // Один и тот же месяц цены в обоих сезонах; солярка и урожайность — последнее значение на эту дату
  const dates = alignedSeasonDate(data.price, [from, to], SEASON_DATE_MMDD);
  if (!dates) return { ok: false, reason: 'noAligned', years, plan, fromProfile };
  const label = (iso: string) => {
    const m = formatDate(iso, 'month');
    return m.charAt(0).toUpperCase() + m.slice(1);
  };
  const base = periodStateAt(plan, data, dates.from, { yieldFromData: true, label: label(dates.from) });
  const current = periodStateAt(plan, data, dates.to, { yieldFromData: true, label: label(dates.to) });
  const analysis = factorAnalysis(base, current, plan.areaHa, plan.crop);
  return { ok: true, model: { plan, fromProfile, years, from, to, dates, analysis } };
}

/** С кем сравнивать показатель на шаге «Регион»: для урожайности — регионы и Россия, для цен — только регионы. */
export function compareScopes(region: RegionId, factor: FactorId): GeoScope[] {
  const list = REGIONS[region]?.compareWith ?? [];
  return factor === 'yield' ? list : list.filter((s) => s in REGIONS);
}

export const seriesYear = (s: DataSeries, year: number) => numberAt(s, seasonDate(year));

/** Фактические даты точек цены и солярки, взятых на дату сезона (цена может быть за прошлый месяц). */
export function pointDates(data: MarketData, d: string): { price: string | null; diesel: string | null } {
  return { price: numberAt(data.price, d)?.date ?? null, diesel: numberAt(data.diesel, d)?.date ?? null };
}

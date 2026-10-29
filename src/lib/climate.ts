// Погода сезона против нормы: помесячные ряды ERA5 (осадки, температура). Владелец — finance-modeler.
// Общие функции для «Урожай и погода» и «Почему изменилась прибыль» (С3).
//
// Метод (для методики):
// • Норма месяца — среднее значение этого календарного месяца за годы нормы (по умолчанию 2019–2025:
//   все полные годы ряда до года последних данных). Неполный месяц в норму не входит.
// • Неполный месяц — последний месяц ряда, если данные заканчиваются раньше его последнего дня
//   (дата среза — из пояснения к ряду «по YYYY-MM-DD», иначе updated_at). С нормой он не сравнивается
//   и в итоги сезона не входит.
// • Сезон года — сумма (осадки) или среднее (температура) по месяцам сезона, по умолчанию апрель–сентябрь.
//   Если какого-то месяца нет или он неполный — значения сезона за этот год нет.
import type { CropId, DataPoint, DataSeries, RegionId } from '../types';
import { REGIONS } from '../config/regions';
import { daysInMonth, validPoints } from './series';

export interface YearRange {
  from: number;
  to: number;
}

export interface YearMonth {
  year: number;
  month: number;
}

export interface SeasonMonthRow {
  month: number;
  /** 'YYYY-MM-01' */
  date: string;
  value: number | null;
  /** Норма месяца за годы нормы; null — нет данных */
  norm: number | null;
  /** value / norm − 1, % (для осадков); null — неполный месяц, нет значения или норма 0 */
  deviationPct: number | null;
  /** value − norm, в единицах ряда (для температуры: «на 1,8 °C теплее»); null — как выше */
  diff: number | null;
  incomplete: boolean;
}

export const DEFAULT_SEASON_MONTHS = [4, 5, 6, 7, 8, 9];
export const DEFAULT_ROW_MONTHS = [4, 5, 6, 7, 8, 9, 10];
export const DEFAULT_NORM_YEARS: YearRange = { from: 2019, to: 2025 };

const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = (y: number, m: number) => `${y}-${pad(m)}-01`;
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Дата среза данных: «по YYYY-MM-DD» из note, иначе updated_at. null — дата не распознана. */
export function dataCutoff(s: DataSeries): string | null {
  const fromNote = s.note?.match(/по\s+(\d{4}-\d{2}-\d{2})/)?.[1];
  const d = fromNote ?? s.updated_at;
  return /^\d{4}-\d{2}-\d{2}/.test(d ?? '') ? d.slice(0, 10) : null;
}

/** 'YYYY-MM-01' последнего месяца ряда, если он неполный (срез данных раньше конца месяца); иначе null. */
export function incompleteMonth(s: DataSeries): string | null {
  const cut = dataCutoff(s);
  const pts = validPoints(s.series);
  const last = pts[pts.length - 1];
  if (!cut || !last) return null;
  if (last.date.slice(0, 7) !== cut.slice(0, 7)) return null;
  const y = Number(cut.slice(0, 4));
  const m = Number(cut.slice(5, 7));
  return Number(cut.slice(8, 10)) < daysInMonth(y, m) ? monthKey(y, m) : null;
}

/** Значения по 'YYYY-MM-01' без неполного месяца. */
function completeMonths(s: DataSeries): Map<string, number> {
  const skip = incompleteMonth(s);
  const out = new Map<string, number>();
  for (const p of validPoints(s.series)) {
    const k = `${p.date.slice(0, 7)}-01`;
    if (k !== skip) out.set(k, p.value);
  }
  return out;
}

/** Годы нормы по умолчанию для ряда: от первого года до года перед срезом данных. */
export function normYearsOf(s: DataSeries): YearRange {
  const pts = validPoints(s.series);
  const cut = dataCutoff(s) ?? pts[pts.length - 1]?.date;
  if (!pts.length || !cut) return DEFAULT_NORM_YEARS;
  return { from: Number(pts[0].date.slice(0, 4)), to: Number(cut.slice(0, 4)) - 1 };
}

/** Норма по календарным месяцам (1–12) — среднее за годы r; неполные месяцы не учитываются. */
export function monthlyNorm(s: DataSeries, r: YearRange): Map<number, number> {
  const acc = new Map<number, number[]>();
  for (const [k, v] of completeMonths(s)) {
    const y = Number(k.slice(0, 4));
    if (y < r.from || y > r.to) continue;
    const m = Number(k.slice(5, 7));
    acc.set(m, [...(acc.get(m) ?? []), v]);
  }
  const out = new Map<number, number>();
  for (const [m, vs] of [...acc.entries()].sort(([a], [b]) => a - b)) out.set(m, mean(vs) as number);
  return out;
}

/** Значение сезона (сумма или среднее по months) для каждого года ряда; неполный сезон — value: null. */
export function seasonByYear(s: DataSeries, agg: 'sum' | 'mean', months: number[] = DEFAULT_SEASON_MONTHS): DataPoint[] {
  const vals = completeMonths(s);
  const years = [...new Set(validPoints(s.series).map((p) => Number(p.date.slice(0, 4))))].sort((a, b) => a - b);
  return years.map((y) => {
    const xs = months.map((m) => vals.get(monthKey(y, m)));
    if (xs.length === 0 || xs.some((v) => v === undefined)) return { date: `${y}-01-01`, value: null };
    const sum = (xs as number[]).reduce((a, b) => a + b, 0);
    return { date: `${y}-01-01`, value: agg === 'sum' ? sum : sum / xs.length };
  });
}

/** Среднее годовых точек ('YYYY-01-01') за годы r; null — данных нет. */
export function normOfYears(points: DataPoint[], r: YearRange): number | null {
  return mean(
    validPoints(points)
      .filter((p) => {
        const y = Number(p.date.slice(0, 4));
        return y >= r.from && y <= r.to;
      })
      .map((p) => p.value),
  );
}

/** Строки «месяц против нормы» для произвольного окна месяцев (может переходить через Новый год). */
export function monthRows(s: DataSeries, window: YearMonth[], normYears: YearRange = DEFAULT_NORM_YEARS): SeasonMonthRow[] {
  const skip = incompleteMonth(s);
  const norms = monthlyNorm(s, normYears);
  const raw = new Map(validPoints(s.series).map((p) => [`${p.date.slice(0, 7)}-01`, p.value]));
  return window.map(({ year, month }) => {
    const date = monthKey(year, month);
    const value = raw.get(date) ?? null;
    const norm = norms.get(month) ?? null;
    const incomplete = date === skip;
    const ok = !incomplete && value !== null && norm !== null;
    return {
      month,
      date,
      value,
      norm,
      deviationPct: ok && norm !== 0 ? (value / norm - 1) * 100 : null,
      diff: ok ? value - norm : null,
      incomplete,
    };
  });
}

/** Месяцы сезона `year` (по умолчанию апрель–октябрь) против нормы этих месяцев. */
export function seasonMonthRows(
  s: DataSeries,
  year: number,
  months: number[] = DEFAULT_ROW_MONTHS,
  normYears: YearRange = DEFAULT_NORM_YEARS,
): SeasonMonthRow[] {
  return monthRows(s, months.map((month) => ({ year, month })), normYears);
}

/**
 * Окно «начало вегетации → конец уборки» по календарю REGIONS[region].season[crop] для урожая `year`.
 * У озимых вегетация начинается осенью предыдущего года (ноябрь 2025 → июль 2026).
 * Нет календаря — май–октябрь `year`.
 */
export function growingWindow(region: RegionId, crop: CropId, year: number): YearMonth[] {
  const phases = REGIONS[region]?.season?.[crop] ?? [];
  const growing = phases.find((p) => p.id === 'growing');
  const harvest = phases.find((p) => p.id === 'harvest');
  const startM = growing ? Number(growing.from.slice(0, 2)) : 5;
  const endM = harvest ? Number(harvest.to.slice(0, 2)) : 10;
  const out: YearMonth[] = [];
  let y = startM > endM ? year - 1 : year;
  let m = startM;
  for (let guard = 0; guard < 13; guard++) {
    out.push({ year: y, month: m });
    if (y === year && m === endM) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Критическое окно — месяцы, когда погода сильнее всего бьёт по урожаю (налив и созревание):
 * месяц перед началом уборки + месяцы уборки по REGIONS[region].season[crop].
 * Кубанская пшеница (уборка 15.06–31.07) → май, июнь, июль; саратовский подсолнечник → август–октябрь.
 * Год `year` — год начала уборки. Нет календаря — июнь–август `year`.
 */
export function criticalWindow(region: RegionId, crop: CropId, year: number): YearMonth[] {
  const harvest = REGIONS[region]?.season?.[crop]?.find((p) => p.id === 'harvest');
  if (!harvest) return [6, 7, 8].map((month) => ({ year, month }));
  const startM = Number(harvest.from.slice(0, 2));
  const endM = Number(harvest.to.slice(0, 2));
  const out: YearMonth[] = [startM === 1 ? { year: year - 1, month: 12 } : { year, month: startM - 1 }];
  let y = year;
  let m = startM;
  for (let guard = 0; guard < 12; guard++) {
    out.push({ year: y, month: m });
    if (m === endM) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export interface WeatherCause {
  month: number;
  /** 'YYYY-MM-01' */
  date: string;
  /** dry — осадков меньше нормы, wet — больше */
  kind: 'dry' | 'wet';
  deviationPct: number;
}

export const MAIN_CAUSE_THRESHOLD_PCT = 30;

/**
 * Главная погодная причина: среди месяцев критического окна (без неполных) — месяц с наибольшим
 * |отклонением осадков от нормы|, если оно не меньше порога (по умолчанию 30%).
 * null — «погода сезона не объясняет» изменение урожая.
 */
export function mainWeatherCause(
  rows: SeasonMonthRow[],
  critical: YearMonth[],
  opts: { thresholdPct?: number } = {},
): WeatherCause | null {
  const threshold = opts.thresholdPct ?? MAIN_CAUSE_THRESHOLD_PCT;
  const keys = new Set(critical.map((c) => monthKey(c.year, c.month)));
  let best: SeasonMonthRow | null = null;
  for (const r of rows) {
    if (r.incomplete || r.deviationPct === null || !keys.has(r.date)) continue;
    if (Math.abs(r.deviationPct) < threshold) continue;
    if (!best || Math.abs(r.deviationPct) > Math.abs(best.deviationPct as number)) best = r;
  }
  if (!best || best.deviationPct === null) return null;
  return { month: best.month, date: best.date, kind: best.deviationPct < 0 ? 'dry' : 'wet', deviationPct: best.deviationPct };
}

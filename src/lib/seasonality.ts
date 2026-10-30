// Сезонность цен. Владелец — finance-modeler.
import type { BuildSeasonalProfile, DataSeries, GeoScope, SeasonalDeviationFn, SeasonalMonth, SeasonalProfile, SignalStatus, SourceRef } from '../types';
import { validPoints } from './series';

export const DEFAULT_PROFILE_YEARS = 5;
export const DEFAULT_DEVIATION_THRESHOLD_PCT = 3;

/** Средняя цена по месяцам: ключ 'YYYY-MM' (недельные/дневные ряды сводятся к месяцам). */
export function monthlyAverages(series: DataSeries): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const p of validPoints(series.series)) {
    const k = p.date.slice(0, 7);
    const a = acc.get(k) ?? { sum: 0, n: 0 };
    a.sum += p.value;
    a.n += 1;
    acc.set(k, a);
  }
  const out = new Map<string, number>();
  for (const [k, a] of [...acc.entries()].sort(([x], [y]) => (x < y ? -1 : 1))) out.set(k, a.sum / a.n);
  return out;
}

const mk = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Сезонный профиль цены.
 *
 * Метод (для методики):
 * 1. Ряд сводится к средним месячным ценам.
 * 2. Берутся последние `years` (по умолчанию 5) полных календарных лет — годы, где есть цены за все 12 месяцев.
 *    Текущий неполный год в профиль не входит.
 * 3. Чтобы инфляция не искажала профиль, для каждого года считается индекс месяца:
 *    цена месяца / средняя цена этого года. Индекс 1,06 — месяц на 6% дороже среднего по году.
 * 4. Индексы одного месяца усредняются по годам (min/max — разброс по годам).
 * 5. Норма месяца в рублях = индекс × средняя цена за последние 12 месяцев ряда
 *    (то есть в ценах последнего года). min/max переводятся в рубли так же.
 * Если полных лет нет — индекс 1, норма = средняя цена за последние 12 месяцев, years = 0.
 */
export const buildSeasonalProfile: BuildSeasonalProfile = (series, years = DEFAULT_PROFILE_YEARS) => {
  const monthly = monthlyAverages(series);
  const allYears = [...new Set([...monthly.keys()].map((k) => Number(k.slice(0, 4))))].sort((a, b) => a - b);
  const fullYears = allYears.filter((y) => {
    for (let m = 1; m <= 12; m++) if (!monthly.has(mk(y, m))) return false;
    return true;
  });
  const used = fullYears.slice(-Math.max(0, Math.floor(years)));

  const last12 = [...monthly.values()].slice(-12);
  const basePrice = last12.length > 0 ? mean(last12) : 0;

  const indicesByMonth: number[][] = Array.from({ length: 12 }, () => []);
  for (const y of used) {
    const prices = Array.from({ length: 12 }, (_, i) => monthly.get(mk(y, i + 1)) as number);
    const avg = mean(prices);
    if (avg <= 0) continue; // защитный случай: нулевые цены за год — год пропускаем
    prices.forEach((p, i) => indicesByMonth[i].push(p / avg));
  }

  const months: SeasonalMonth[] = indicesByMonth.map((idx, i) => {
    const index = idx.length > 0 ? mean(idx) : 1;
    const lo = idx.length > 0 ? Math.min(...idx) : 1;
    const hi = idx.length > 0 ? Math.max(...idx) : 1;
    return {
      month: i + 1,
      index,
      normPrice: index * basePrice,
      min: lo * basePrice,
      max: hi * basePrice,
      years: idx.length,
    };
  });

  return {
    crop: series.crop ?? 'wheat',
    region: series.region,
    years: used,
    months,
    source: {
      source: series.source,
      source_url: series.source_url,
      updated_at: series.updated_at,
      demo: series.demo,
    },
  };
};

/** Статус для продавца: выше нормы больше порога — better, ниже — worse, иначе normal. */
export function sellerStatus(deviationPct: number, thresholdPct = DEFAULT_DEVIATION_THRESHOLD_PCT): SignalStatus {
  if (deviationPct > thresholdPct) return 'better';
  if (deviationPct < -thresholdPct) return 'worse';
  return 'normal';
}

/**
 * Отклонение цены на дату (по умолчанию — последняя точка ряда) от нормы своего месяца.
 * Берётся последнее известное значение ≤ date; месяц — месяц этой точки.
 * crop — из series.crop (если null — поле не ставится). Пустой ряд → Error. Норма 0 → отклонение 0 (normal).
 */
export const seasonalDeviation: SeasonalDeviationFn = (series, profile, opts = {}) => {
  const pts = validPoints(series.series).filter((p) => opts.date === undefined || p.date <= opts.date);
  const point = pts[pts.length - 1];
  if (!point) throw new Error('Нет цены для расчёта отклонения от сезонной нормы');
  const month = Number(point.date.slice(5, 7));
  const normPrice = profile.months.find((m) => m.month === month)?.normPrice ?? 0;
  const deviationPct = normPrice > 0 ? (point.value / normPrice - 1) * 100 : 0;
  return {
    ...(series.crop ? { crop: series.crop } : {}),
    date: point.date,
    month,
    currentPrice: point.value,
    normPrice,
    deviationPct,
    status: sellerStatus(deviationPct, opts.thresholdPct ?? DEFAULT_DEVIATION_THRESHOLD_PCT),
  };
};

// ─── Региональный профиль: форма — по России, уровень — по региону ───────────

/** Профиль с пометкой, откуда взята форма сезонности и сколько месяцев дали уровень. */
export interface RegionalSeasonalProfile extends SeasonalProfile {
  /** Откуда индексы месяцев (форма): обычно Россия */
  shape: { region: GeoScope; source: SourceRef; years: number[] };
  /** Сколько последних месяцев с данными регионального ряда вошло в уровень (≤ 12) */
  levelMonths: number;
  /** Средняя цена региона за эти месяцы, ₽/т */
  levelPrice: number;
}

/**
 * Перенос сезонного профиля на уровень другого ряда.
 * Индексы месяцев (форма) — из profile; normPrice, min, max = индекс × средняя цена levelSeries
 * за последние 12 месяцев с данными (пропуски null не считаются; если месяцев меньше 12 — по тем,
 * что есть, их число — в levelMonths).
 * В результате: region и crop — регионального ряда, source — источник регионального ряда
 * (demo, если демо хотя бы один из рядов), years — годы исходного профиля; исходник формы — в shape.
 * Если в levelSeries нет данных — уровень 0 и levelMonths = 0 (норму показывать нельзя).
 *
 * Для методики: «Региональные ряды цен Росстата короткие (с 2025 года), поэтому форму сезонности
 * берём по России: для каждого месяца — во сколько раз цена обычно выше или ниже среднегодовой
 * (среднее за 5 полных лет). Уровень — региональный: норма месяца = этот коэффициент × средняя цена
 * в регионе за последние 12 месяцев, по которым есть данные.»
 */
export function rescaleProfile(profile: SeasonalProfile, levelSeries: DataSeries): RegionalSeasonalProfile {
  const level = [...monthlyAverages(levelSeries).values()].slice(-12);
  const levelPrice = level.length > 0 ? level.reduce((a, b) => a + b, 0) / level.length : 0;
  // Уровень исходного профиля = средняя normPrice по 12 месяцам (средний индекс = 1 по построению).
  const srcLevel = profile.months.reduce((a, m) => a + m.normPrice, 0) / (profile.months.length || 1);
  const scale = (v: number, index: number) => (srcLevel > 0 ? (v / srcLevel) * levelPrice : index * levelPrice);
  return {
    crop: levelSeries.crop ?? profile.crop,
    region: levelSeries.region,
    years: profile.years,
    months: profile.months.map((m) => ({
      ...m,
      normPrice: m.index * levelPrice,
      min: scale(m.min, m.index),
      max: scale(m.max, m.index),
    })),
    source: {
      source: levelSeries.source,
      source_url: levelSeries.source_url,
      updated_at: levelSeries.updated_at,
      demo: levelSeries.demo || profile.source.demo,
    },
    shape: { region: profile.region, source: profile.source, years: profile.years },
    levelMonths: level.length,
    levelPrice,
  };
}

/** Один вызов для страниц: форма — по russiaSeries за `years` полных лет, уровень — по regionSeries. */
export function buildRegionalProfile(
  russiaSeries: DataSeries,
  regionSeries: DataSeries,
  years = DEFAULT_PROFILE_YEARS,
): RegionalSeasonalProfile {
  return rescaleProfile(buildSeasonalProfile(russiaSeries, years), regionSeries);
}

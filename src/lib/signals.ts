// Правила «Что изменилось» и погодные риски. Владелец — finance-modeler.
import type {
  BuildSignals,
  CropId,
  DailyWeather,
  DetectWeatherRisks,
  FactorAnalysis,
  FactorContribution,
  PickAdvice,
  Signal,
  SignalKind,
  SignalStatus,
  SourceRef,
  WeatherRisk,
  WeatherRiskType,
} from '../types';
import { CROPS } from '../config/regions';
import { ROUTES } from '../routes';
import { formatNumber, formatPct, formatRub, NBSP } from './format';
import { chaToT } from './finance';

export const WEATHER_RISK_THRESHOLDS = {
  frostTMin: 0,
  heatTMax: 35,
  dryDayPrecip: 1,
  drySpellDays: 10,
} as const;

/** Изменение меньше этого по модулю (%) считается «почти не изменилось». */
export const CHANGE_NOISE_PCT = 0.5;
/** Приоритет первого погодного риска «worse» — выше любого рублёвого эффекта на гектар. */
export const WEATHER_WORSE_PRIORITY = 1_000_000;
/** Приоритет последующих погодных рисков «worse». */
export const WEATHER_WORSE_PRIORITY_NEXT = 100;

const EMPTY_SOURCE: SourceRef = { source: '', source_url: '', updated_at: '', demo: false };

const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** Род названия культуры — для «подешевела / подешевел». */
const CROP_FEMININE: Record<CropId, boolean> = { wheat: true, barley: false, sunflower: false, corn: true };
/** Короткие имена для заголовков и фраз (без «на зерно»). */
const CROP_SHORT: Record<CropId, string> = { wheat: 'Пшеница', barley: 'Ячмень', sunflower: 'Подсолнечник', corn: 'Кукуруза' };

const cropGen = (c: CropId) => CROPS[c]?.nameGenitive ?? c;
const perHa = (v: number) => `${formatRub(v, { sign: true })} с${NBSP}гектара`;
const absPct = (v: number) => formatPct(Math.abs(v), { sign: false });

function statusOf(effect: number, change: number | null): SignalStatus {
  if (change !== null && Math.abs(change) < CHANGE_NOISE_PCT) return 'normal';
  if (Math.abs(effect) < 1) return 'normal';
  return effect > 0 ? 'better' : 'worse';
}

function contribution(a: FactorAnalysis, f: FactorContribution['factor']): FactorContribution | undefined {
  return a.contributions.find((c) => c.factor === f);
}

function priceSignal(a: FactorAnalysis, source: SourceRef): Signal | null {
  const c = contribution(a, 'price');
  if (!c) return null;
  const ch = c.changePct;
  const status = statusOf(c.effectPerHa, ch);
  const name = CROP_SHORT[a.crop] ?? a.crop;
  const fem = CROP_FEMININE[a.crop] ?? false;
  let text: string;
  if (ch === null) text = `Цена ${cropGen(a.crop)}: ${perHa(c.effectPerHa)}`;
  else if (status === 'normal') text = `Цена ${cropGen(a.crop)} почти не изменилась (${formatPct(ch)})`;
  else {
    const verb = ch > 0 ? (fem ? 'подорожала' : 'подорожал') : fem ? 'подешевела' : 'подешевел';
    text = `${name} ${verb} на ${absPct(ch)} — ${perHa(c.effectPerHa)}`;
  }
  return {
    id: `price-${a.crop}`,
    kind: 'price',
    status,
    title: ch === null ? `Цена ${cropGen(a.crop)}` : `${name} ${formatPct(ch)}`,
    text,
    effectRub: c.effectPerHa,
    effectUnit: '₽/га',
    changePct: ch,
    link: ROUTES.market.path,
    priority: Math.abs(c.effectPerHa),
    source,
  };
}

function yieldSignal(a: FactorAnalysis, source: SourceRef): Signal | null {
  const c = contribution(a, 'yield');
  if (!c || c.from === c.to) return null; // урожайность не менялась — сигнала нет
  const ch = c.changePct;
  const status = statusOf(c.effectPerHa, ch);
  let text: string;
  if (ch === null) text = `Урожайность ${cropGen(a.crop)}: ${perHa(c.effectPerHa)}`;
  else if (status === 'normal') text = `Урожайность ${cropGen(a.crop)} почти не изменилась (${formatPct(ch)})`;
  else
    text = `Урожайность ${cropGen(a.crop)} ${ch > 0 ? 'выросла' : 'снизилась'} на ${absPct(ch)} — ${perHa(c.effectPerHa)}`;
  return {
    id: `yield-${a.crop}`,
    kind: 'yield',
    status,
    title: ch === null ? `Урожай ${cropGen(a.crop)}` : `Урожай ${cropGen(a.crop)} ${formatPct(ch)}`,
    text,
    effectRub: c.effectPerHa,
    effectUnit: '₽/га',
    changePct: ch,
    link: ROUTES.harvest.path,
    priority: Math.abs(c.effectPerHa),
    source,
  };
}

/** Солярка общая для хозяйства: один сигнал, эффект — средневзвешенный по площади, ₽/га. */
function dieselSignal(analyses: FactorAnalysis[], source: SourceRef): Signal | null {
  const cs = analyses.map((a) => ({ a, c: contribution(a, 'diesel') })).filter((x) => x.c);
  if (cs.length === 0) return null;
  const area = cs.reduce((s, x) => s + x.a.areaHa, 0);
  const total = cs.reduce((s, x) => s + (x.c as FactorContribution).effectTotal, 0);
  const eff = area > 0 ? total / area : (cs[0].c as FactorContribution).effectPerHa;
  const ch = (cs[0].c as FactorContribution).changePct;
  const status = statusOf(eff, ch);
  let text: string;
  if (ch === null) text = `Солярка: ${perHa(eff)}`;
  else if (status === 'normal') text = `Солярка почти не изменилась в цене (${formatPct(ch)})`;
  else text = `Солярка ${ch > 0 ? 'подорожала' : 'подешевела'} на ${absPct(ch)} — это ${perHa(eff)}`;
  if (status !== 'normal' && area > 0) text += ` (${formatRub(total, { sign: true, compact: true })} на хозяйство)`;
  return {
    id: 'diesel',
    kind: 'diesel',
    status,
    title: ch === null ? 'Солярка' : `Солярка ${formatPct(ch)}`,
    text,
    effectRub: eff,
    effectUnit: '₽/га',
    changePct: ch,
    link: ROUTES.market.path,
    priority: Math.abs(eff),
    source,
  };
}

function seasonalitySignals(ctx: Parameters<BuildSignals>[0], source: SourceRef): Signal[] {
  const out: Signal[] = [];
  (ctx.seasonality ?? []).forEach((d, i) => {
    // Порядок отклонений соответствует ctx.profile.crops (у SeasonalDeviation нет поля crop).
    const plan = ctx.profile.crops[i];
    const crop = plan?.crop;
    const monthGen = MONTHS_GEN[d.month - 1] ?? '';
    const prefix = crop ? `${CROP_SHORT[crop]}: ц` : 'Ц';
    const dev = d.deviationPct;
    let text: string;
    if (d.status === 'better') text = `${prefix}ена на ${absPct(dev)} выше обычной для ${monthGen} — хорошее окно для продажи`;
    else if (d.status === 'worse')
      text = `${prefix}ена на ${absPct(dev)} ниже обычной для ${monthGen} — если есть где хранить, с продажей лучше подождать`;
    else text = `${prefix}ена обычная для ${monthGen} (${formatPct(dev)}) — спешить с продажей незачем`;
    // Рублёвый эффект: (текущая − норма) × плановая урожайность, ₽/га — сколько даёт продажа сейчас против обычной цены.
    const eff = plan ? (d.currentPrice - d.normPrice) * chaToT(plan.yieldCha.value) : null;
    out.push({
      id: `seasonality-${crop ?? i}`,
      kind: 'seasonality',
      status: d.status,
      title: `${crop ? CROP_SHORT[crop] + ': ' : ''}к норме ${formatPct(dev)}`,
      text: eff !== null && d.status !== 'normal' ? `${text} (${perHa(eff)} к обычной цене)` : text,
      effectRub: eff,
      effectUnit: eff === null ? null : '₽/га',
      changePct: dev,
      link: ROUTES.market.path,
      priority: eff === null ? 0 : Math.abs(eff),
      source,
    });
  });
  return out;
}

const WEATHER_TITLES: Record<WeatherRiskType, string> = { frost: 'Заморозок', heat: 'Жара', dry_spell: 'Сухой период' };

function weatherSignals(risks: WeatherRisk[], source: SourceRef): Signal[] {
  let firstWorse = true;
  return risks.map((r, i) => {
    let priority = 1;
    if (r.status === 'worse') {
      priority = firstWorse ? WEATHER_WORSE_PRIORITY : WEATHER_WORSE_PRIORITY_NEXT;
      firstWorse = false;
    }
    return {
      id: `weather-${r.type}-${r.from}-${i}`,
      kind: 'weather' as SignalKind,
      status: r.status,
      title: WEATHER_TITLES[r.type],
      text: r.text,
      effectRub: null,
      effectUnit: null,
      changePct: null,
      link: ROUTES.harvest.path,
      priority,
      source,
    };
  });
}

/** Все сигналы, отсортированные по priority (убыв.). Лента берёт топ-3. */
export const buildSignals: BuildSignals = (ctx) => {
  const src = (k: SignalKind) => ctx.sources[k] ?? EMPTY_SOURCE;
  const list: Signal[] = [];
  for (const a of ctx.analyses) {
    const p = priceSignal(a, src('price'));
    if (p) list.push(p);
    const y = yieldSignal(a, src('yield'));
    if (y) list.push(y);
  }
  const d = dieselSignal(ctx.analyses, src('diesel'));
  if (d) list.push(d);
  list.push(...seasonalitySignals(ctx, src('seasonality')));
  list.push(...weatherSignals(ctx.weatherRisks ?? [], src('weather')));
  return list.sort((a, b) => b.priority - a.priority);
};

/** Что посоветовать по сигналу. null — действия нет. */
function adviceText(s: Signal): string | null {
  if (s.status === 'normal') return null;
  switch (s.kind) {
    case 'seasonality':
      return s.text; // в тексте уже есть действие: продавать или подождать
    case 'weather':
      return `${s.text} — проверьте прогноз и спланируйте полевые работы с учётом риска`;
    case 'diesel':
      return s.status === 'worse'
        ? `${s.text}. Если есть ёмкости — закупите топливо к следующим работам заранее`
        : `${s.text}. Хороший момент запастись топливом`;
    case 'price':
      return s.status === 'worse'
        ? `${s.text}. Сравните цену с сезонной нормой, прежде чем продавать`
        : `${s.text}. Проверьте, не пора ли продавать — сравните с сезонной нормой`;
    case 'yield':
      return `${s.text}. Посмотрите, как это сказывается на безубыточной цене`;
    default:
      return null;
  }
}

/** Один совет-вывод: самый приоритетный сигнал, по которому есть действие (статус не «норма»). */
export const pickAdvice: PickAdvice = (signals) => {
  const sorted = [...signals].sort((a, b) => b.priority - a.priority);
  for (const s of sorted) {
    const text = adviceText(s);
    if (text) return { ...s, id: `advice-${s.id}`, text };
  }
  return null;
};

// ─── Погодные риски ──────────────────────────────────────────────────────────

const dayMs = 86_400_000;
const toDay = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / dayMs);
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthIdx = (iso: string) => Number(iso.slice(5, 7)) - 1;

/** «4 ноября», «4–5 ноября», «30 октября – 2 ноября» */
export function formatDayRange(from: string, to: string): string {
  if (from === to) return `${dayNum(from)}${NBSP}${MONTHS_GEN[monthIdx(from)]}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${dayNum(from)}–${dayNum(to)}${NBSP}${MONTHS_GEN[monthIdx(to)]}`;
  return `${dayNum(from)}${NBSP}${MONTHS_GEN[monthIdx(from)]} – ${dayNum(to)}${NBSP}${MONTHS_GEN[monthIdx(to)]}`;
}

const formatTemp = (t: number, sign = false) => {
  const s = formatNumber(t, 0);
  return `${sign && Math.round(t) > 0 ? '+' : ''}${s}${NBSP}°C`;
};

/** Отрезки подряд идущих дней (по календарю), где выполняется условие. */
function runs(days: DailyWeather[], test: (d: DailyWeather) => boolean): DailyWeather[][] {
  const out: DailyWeather[][] = [];
  let cur: DailyWeather[] = [];
  for (const d of days) {
    const prev = cur[cur.length - 1];
    if (test(d) && (!prev || toDay(d.date) - toDay(prev.date) === 1)) cur.push(d);
    else {
      if (cur.length) out.push(cur);
      cur = test(d) ? [d] : [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Пороги WEATHER_RISK_THRESHOLDS: заморозок tMin ≤ 0 °C, жара tMax > 35 °C,
 * сухой период — не меньше drySpellDays дней подряд с осадками < 1 мм (пропуск данных прерывает период).
 * Подряд идущие дни риска сливаются в один период.
 * Статус: жара — всегда worse; заморозок и сухой период — worse в апреле–октябре (вегетация,
 * всходы озимых), в ноябре–марте — normal (для перезимовки озимых лёгкий мороз и сухая погода — норма).
 */
export const detectWeatherRisks: DetectWeatherRisks = (forecast) => {
  const T = WEATHER_RISK_THRESHOLDS;
  const days = [...forecast].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const inSeason = (iso: string, from: number, to: number) => {
    const m = monthIdx(iso) + 1;
    return m >= from && m <= to;
  };
  const risks: WeatherRisk[] = [];

  for (const r of runs(days, (d) => d.tMin !== null && d.tMin <= T.frostTMin)) {
    const min = Math.min(...r.map((d) => d.tMin as number));
    const from = r[0].date;
    const to = r[r.length - 1].date;
    risks.push({
      type: 'frost',
      from,
      to,
      text: `Заморозок до ${formatTemp(min)} ${formatDayRange(from, to)}`,
      status: inSeason(from, 4, 10) ? 'worse' : 'normal',
    });
  }
  for (const r of runs(days, (d) => d.tMax !== null && d.tMax > T.heatTMax)) {
    const max = Math.max(...r.map((d) => d.tMax as number));
    const from = r[0].date;
    const to = r[r.length - 1].date;
    risks.push({ type: 'heat', from, to, text: `Жара до ${formatTemp(max, true)} ${formatDayRange(from, to)}`, status: 'worse' });
  }
  for (const r of runs(days, (d) => d.precipitation !== null && d.precipitation < T.dryDayPrecip)) {
    if (r.length < T.drySpellDays) continue;
    const from = r[0].date;
    const to = r[r.length - 1].date;
    risks.push({
      type: 'dry_spell',
      from,
      to,
      text: `Без дождей ${r.length}${NBSP}${plural(r.length, 'день', 'дня', 'дней')} подряд: ${formatDayRange(from, to)}`,
      status: inSeason(from, 4, 10) ? 'worse' : 'normal',
    });
  }
  return risks.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
};

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

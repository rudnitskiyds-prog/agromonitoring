// Русский формат чисел. Владелец — finance-modeler.
// Разделитель разрядов — неразрывный пробел (U+00A0), десятичная запятая, минус «−» (U+2212).
import type { FormatDate, FormatNumber, FormatPct, FormatRub } from '../types';

export const NBSP = ' ';
export const MINUS = '−';

const formatters = new Map<number, Intl.NumberFormat>();
function nf(fractionDigits: number): Intl.NumberFormat {
  let f = formatters.get(fractionDigits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
      useGrouping: true,
    });
    formatters.set(fractionDigits, f);
  }
  return f;
}

/** Модуль числа в русском формате; любые пробелы движка → NBSP, группировка и для 4-значных. */
function formatAbs(abs: number, fractionDigits: number): string {
  const s = nf(fractionDigits).format(abs).replace(/[\s ]/g, NBSP);
  // Некоторые движки (minimumGroupingDigits = 2) не группируют 4-значные: «1850» → «1 850».
  return s.replace(/^(\d)(\d{3})(?=,|$)/, `$1${NBSP}$2`);
}

/** Округление, при котором −0,0 не превращается в «−0». */
function roundTo(value: number, fractionDigits: number): number {
  const k = 10 ** fractionDigits;
  const r = Math.round(Math.abs(value) * k) / k;
  return r === 0 ? 0 : Math.sign(value) * r;
}

function signed(value: number, body: string, sign: boolean): string {
  if (value < 0) return MINUS + body;
  if (sign && value > 0) return '+' + body;
  return body;
}

/** «1 234 567,8», «−3,2». fractionDigits — максимум знаков после запятой (по умолчанию 0). */
export const formatNumber: FormatNumber = (value, fractionDigits = 0) => {
  if (!Number.isFinite(value)) return '—';
  const r = roundTo(value, fractionDigits);
  return signed(r, formatAbs(Math.abs(r), fractionDigits), false);
};

/**
 * «−1 850 ₽», «+742 000 ₽», «12 400 ₽/т».
 * compact: «742 тыс. ₽», «1,2 млн ₽», «3,4 млрд ₽» (до 1 000 — без сокращения).
 */
export const formatRub: FormatRub = (value, opts = {}) => {
  const unit = opts.unit ?? '₽';
  const sign = opts.sign ?? false;
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (opts.compact && abs >= 1000) {
    let div = 1e3;
    let suffix = 'тыс.';
    if (abs >= 1e9) {
      div = 1e9;
      suffix = 'млрд';
    } else if (abs >= 1e6) {
      div = 1e6;
      suffix = 'млн';
    }
    const scaled = abs / div;
    // тыс. — целые; млн/млрд — один знак (1,2 млн), если меньше 10.
    const digits = div === 1e3 ? 0 : scaled < 10 ? 1 : 0;
    const r = roundTo(scaled, digits);
    const unitTail = unit === '₽' ? '₽' : unit;
    return signed(value < 0 ? -r : r, `${formatAbs(r, digits)}${NBSP}${suffix}${NBSP}${unitTail}`, sign);
  }
  const r = roundTo(value, 0);
  return signed(r, `${formatAbs(Math.abs(r), 0)}${NBSP}${unit}`, sign);
};

/** «+4%», «−3,2%». sign по умолчанию true; fractionDigits по умолчанию 1 (лишний ноль отбрасывается). */
export const formatPct: FormatPct = (value, opts = {}) => {
  const digits = opts.fractionDigits ?? 1;
  const sign = opts.sign ?? true;
  if (!Number.isFinite(value)) return '—';
  const r = roundTo(value, digits);
  return signed(r, `${formatAbs(Math.abs(r), digits)}%`, sign);
};

// ─── Даты ────────────────────────────────────────────────────────────────────

export const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
] as const;
export const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
] as const;
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] as const;

const DATE_RE = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Разбор 'YYYY-MM-DD' / 'YYYY-MM' без Date и часовых поясов. Время после 'T' отбрасывается. */
export function parseIsoDate(iso: string): { year: number; month: number; day: number | null } | null {
  const m = typeof iso === 'string' ? DATE_RE.exec(iso.trim()) : null;
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  if (m[3] === undefined) return { year, month, day: null };
  const day = Number(m[3]);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > dim) return null;
  return { year, month, day };
}

/**
 * «28 октября 2026» (long, по умолчанию), «28 октября» (dayMonth), «октябрь 2026» (month),
 * «окт» (monthShort), «октября» (monthGenitive), «2026» (year). Некорректная строка → «—».
 * Для 'YYYY-MM' без дня: long → «октябрь 2026», dayMonth → «октября».
 */
export const formatDate: FormatDate = (iso, style = 'long') => {
  const d = parseIsoDate(iso);
  if (!d) return '—';
  const i = d.month - 1;
  switch (style) {
    case 'year':
      return String(d.year);
    case 'monthShort':
      return MONTHS_SHORT[i];
    case 'monthGenitive':
      return MONTHS_GEN[i];
    case 'month':
      return `${MONTHS_NOM[i]}${NBSP}${d.year}`;
    case 'dayMonth':
      return d.day === null ? MONTHS_GEN[i] : `${d.day}${NBSP}${MONTHS_GEN[i]}`;
    case 'long':
    default:
      return d.day === null ? `${MONTHS_NOM[i]}${NBSP}${d.year}` : `${d.day}${NBSP}${MONTHS_GEN[i]}${NBSP}${d.year}`;
  }
};

export const MONTHS_PREP = [
  'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре',
] as const;
export const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const;

/** «в марте» (предлог через неразрывный пробел). Принимает 'YYYY-MM-DD' и 'YYYY-MM'; некорректная строка → «—». */
export function formatMonthPrepositional(iso: string): string {
  const d = parseIsoDate(iso);
  return d ? `в${NBSP}${MONTHS_PREP[d.month - 1]}` : '—';
}

/** «пн» … «вс». Нужна полная дата 'YYYY-MM-DD'; день недели — по календарю, без часового пояса. Иначе «—». */
export function formatWeekdayShort(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d || d.day === null) return '—';
  // Date.UTC + getUTCDay — чистая календарная арифметика, локальный пояс не участвует.
  return WEEKDAYS_SHORT[new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()];
}

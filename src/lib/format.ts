// Русский формат чисел. Владелец — finance-modeler.
// Разделитель разрядов — неразрывный пробел (U+00A0), десятичная запятая, минус «−» (U+2212).
import type { FormatNumber, FormatPct, FormatRub } from '../types';

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

import { describe, expect, it } from 'vitest';
import { formatDate, formatMonthPrepositional, formatNumber, formatPct, formatRub, formatWeekdayShort, parseIsoDate } from './format';

// Для читаемости: заменяем NBSP на обычный пробел и проверяем, что обычных пробелов в исходнике нет.
const plain = (s: string) => {
  expect(s).not.toMatch(/ /);
  return s.replace(/ /g, ' ');
};

describe('formatNumber', () => {
  it('разряды неразрывным пробелом и десятичная запятая', () => {
    expect(plain(formatNumber(1234567.8, 1))).toBe('1 234 567,8');
    expect(plain(formatNumber(1850))).toBe('1 850');
    expect(formatNumber(999)).toBe('999');
  });
  it('минус — U+2212, без «−0»', () => {
    expect(formatNumber(-3.24, 1)).toBe('−3,2');
    expect(formatNumber(-0.01, 0)).toBe('0');
  });
  it('нечисло → тире', () => {
    expect(formatNumber(NaN)).toBe('—');
  });
});

describe('formatRub', () => {
  it('рубли и единицы', () => {
    expect(plain(formatRub(-1850))).toBe('−1 850 ₽');
    expect(plain(formatRub(742000, { sign: true }))).toBe('+742 000 ₽');
    expect(plain(formatRub(12400, { unit: '₽/т' }))).toBe('12 400 ₽/т');
    expect(plain(formatRub(-620, { unit: '₽/га', sign: true }))).toBe('−620 ₽/га');
    expect(formatRub(0, { sign: true })).toBe('0 ₽');
  });
  it('compact', () => {
    expect(plain(formatRub(742000, { compact: true }))).toBe('742 тыс. ₽');
    expect(plain(formatRub(1_234_000, { compact: true }))).toBe('1,2 млн ₽');
    expect(plain(formatRub(-15_600_000, { compact: true, sign: true }))).toBe('−16 млн ₽');
    expect(plain(formatRub(2_500_000_000, { compact: true }))).toBe('2,5 млрд ₽');
    expect(plain(formatRub(950, { compact: true }))).toBe('950 ₽');
  });
});

describe('formatPct', () => {
  it('со знаком по умолчанию', () => {
    expect(formatPct(4)).toBe('+4%');
    expect(formatPct(-3.2)).toBe('−3,2%');
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(4, { sign: false })).toBe('4%');
    expect(formatPct(6.04, { fractionDigits: 0 })).toBe('+6%');
  });
});

describe('formatDate', () => {
  it('все стили, неразрывные пробелы', () => {
    expect(plain(formatDate('2026-10-28'))).toBe('28 октября 2026');
    expect(plain(formatDate('2026-10-28', 'long'))).toBe('28 октября 2026');
    expect(plain(formatDate('2026-10-28', 'dayMonth'))).toBe('28 октября');
    expect(plain(formatDate('2026-10-28', 'month'))).toBe('октябрь 2026');
    expect(formatDate('2026-10-28', 'monthShort')).toBe('окт');
    expect(formatDate('2026-10-28', 'monthGenitive')).toBe('октября');
    expect(formatDate('2026-10-28', 'year')).toBe('2026');
    expect(plain(formatDate('2026-05-01', 'dayMonth'))).toBe('1 мая');
  });
  it('формат YYYY-MM', () => {
    expect(plain(formatDate('2026-03', 'month'))).toBe('март 2026');
    expect(plain(formatDate('2026-03'))).toBe('март 2026');
    expect(formatDate('2026-03', 'monthGenitive')).toBe('марта');
    expect(formatDate('2026-03', 'dayMonth')).toBe('марта');
  });
  it('без сдвига часового пояса: 1 января остаётся 1 января', () => {
    expect(plain(formatDate('2026-01-01'))).toBe('1 января 2026');
    expect(plain(formatDate('2025-12-31'))).toBe('31 декабря 2025');
    expect(plain(formatDate('2026-01-01T00:00:00.000Z'))).toBe('1 января 2026');
  });
  it('некорректная строка → «—»', () => {
    for (const bad of ['', 'abc', '2026-13-01', '2026-02-30', '2026-00', '26-10-01', '2026/10/28']) {
      expect(formatDate(bad)).toBe('—');
    }
    expect(plain(formatDate('2024-02-29'))).toBe('29 февраля 2024');
    expect(parseIsoDate('2025-02-29')).toBeNull();
  });
});

describe('formatMonthPrepositional и formatWeekdayShort', () => {
  it('«в марте», «в мае»', () => {
    expect(plain(formatMonthPrepositional('2026-03-15'))).toBe('в марте');
    expect(plain(formatMonthPrepositional('2026-05'))).toBe('в мае');
    expect(plain(formatMonthPrepositional('2026-10-28'))).toBe('в октябре');
    expect(formatMonthPrepositional('2026-13')).toBe('—');
  });
  it('дни недели без сдвига пояса', () => {
    expect(formatWeekdayShort('2026-10-26')).toBe('пн');
    expect(formatWeekdayShort('2026-10-28')).toBe('ср');
    expect(formatWeekdayShort('2026-11-01')).toBe('вс');
    expect(formatWeekdayShort('2026-01-01')).toBe('чт');
    expect(formatWeekdayShort('2024-02-29')).toBe('чт');
    expect(formatWeekdayShort('2026-10')).toBe('—');
    expect(formatWeekdayShort('abc')).toBe('—');
  });
});

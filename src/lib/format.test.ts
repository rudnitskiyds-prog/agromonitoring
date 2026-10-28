import { describe, expect, it } from 'vitest';
import { formatNumber, formatPct, formatRub } from './format';

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

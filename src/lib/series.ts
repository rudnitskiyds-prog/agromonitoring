// Помощники по рядам данных. Владелец — finance-modeler.
import type { ChangePct, DataPoint, DataSeries, ValueAt } from '../types';

/** Точки с числовым значением, отсортированные по дате (ISO-даты сравниваются строкой). */
export function validPoints(points: DataPoint[]): Array<{ date: string; value: number }> {
  return points
    .filter((p): p is { date: string; value: number } => typeof p.value === 'number' && Number.isFinite(p.value))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Как valueAt, но с типом value: number (для расчётов без лишних проверок на null). */
export function numberAt(series: DataSeries, date?: string): { date: string; value: number } | null {
  const pts = validPoints(series.series);
  for (let i = pts.length - 1; i >= 0; i--) {
    if (date === undefined || pts[i].date <= date) return { date: pts[i].date, value: pts[i].value };
  }
  return null;
}

/** Последнее непустое значение с датой ≤ date (по умолчанию — последнее в ряду). */
export const valueAt: ValueAt = (series, date) => numberAt(series, date);

/** Изменение между двумя датами, %; null если нет данных или база = 0. */
export const changePct: ChangePct = (series, from, to) => {
  const a = numberAt(series, from);
  const b = numberAt(series, to);
  if (!a || !b || a.value === 0) return null;
  return (b.value / a.value - 1) * 100;
};

/** Сдвиг ISO-даты на n месяцев (первое число месяца), например для «месяц назад». */
export function shiftMonths(isoDate: string, n: number): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}

/**
 * Тот же день n месяцев назад: '2026-10-26' → '2026-09-26'. Если такого дня нет —
 * последний день месяца: '2026-03-31' → '2026-02-28' (в високосный год — 29-е).
 * Это база сравнения «за месяц»: periodStateAt(plan, data, monthAgo(date)).
 */
export function monthAgo(isoDate: string, n = 1): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7)) - 1 - n;
  const d = Number(isoDate.slice(8, 10)) || 1;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  const dim = daysInMonth(yy, mm + 1);
  return `${yy}-${String(mm + 1).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}

/** Дней в месяце (month 1–12), с учётом високосных лет; без Date. */
export function daysInMonth(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Даты двух сезонов на один и тот же месяц — чтобы сравнивать одинаковые месяцы (С3).
 * Ищет самый поздний месяц не позже `preferred` ('MM-DD', по умолчанию '10-01'), в котором у ряда
 * есть непустое значение в ОБОИХ годах years = [базовый, текущий]. Поиск идёт назад только внутри
 * календарного года (до января), в прошлый год не переходит.
 * Возвращает даты этих точек: from — базовый год, to — текущий (для месячного ряда — 'YYYY-MM-01').
 * null — общего месяца нет: сравнить сезоны по цене на одну дату нельзя.
 */
export function alignedSeasonDate(
  series: DataSeries,
  years: [number, number],
  preferred = '10-01',
): { from: string; to: string } | null {
  const pts = validPoints(series.series);
  // Первая непустая точка месяца в году не позже preferred: 'YYYY-MM' → дата.
  const firstIn = (y: number, mm: string): string | null => {
    const p = pts.find((x) => x.date.startsWith(`${y}-${mm}`) && x.date.slice(5, 10) <= preferred);
    return p ? p.date : null;
  };
  const startM = Number(preferred.slice(0, 2));
  if (!(startM >= 1 && startM <= 12)) return null;
  for (let m = startM; m >= 1; m--) {
    const mm = String(m).padStart(2, '0');
    const from = firstIn(years[0], mm);
    const to = firstIn(years[1], mm);
    if (from && to) return { from, to };
  }
  return null;
}

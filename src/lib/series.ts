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

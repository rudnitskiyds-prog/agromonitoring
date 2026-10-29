// Какие месяцы задевает фаза полосы сезона ('MM-DD' → 'MM-DD', может переходить через Новый год).
// Нужно только для подсветки столбцов сезонного профиля при клике по фазе.
import type { SeasonPhase } from '../../types';

export function phaseMonths(p: SeasonPhase): number[] {
  const from = Number(p.from.slice(0, 2));
  const to = Number(p.to.slice(0, 2));
  const out: number[] = [];
  for (let m = from, i = 0; i < 12; i++, m = (m % 12) + 1) {
    out.push(m);
    if (m === to) break;
  }
  return out;
}

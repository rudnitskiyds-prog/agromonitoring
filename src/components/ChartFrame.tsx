import type { ReactNode } from 'react';
import type { SourceRef } from '../types';
import SourceNote from './SourceNote';

export interface ChartFrameProps {
  /** Заголовок-вопрос: «Выгодно ли продавать сейчас?» */
  question: string;
  /** Ответ/вывод одной строкой под вопросом */
  lead?: ReactNode;
  /** Подпись единиц оси Y — одна ось на график: «₽/т» */
  unit?: string;
  /** Справа от заголовка: переключатели периода, культуры */
  actions?: ReactNode;
  /** Источник обязателен: каждая цифра — с источником и датой */
  source: SourceRef | SourceRef[];
  sourceNote?: string;
  /** Уровень заголовка: h2 — главный график страницы, h3 — второстепенный */
  as?: 'h2' | 'h3';
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Рамка графика: вопрос, вывод, слот графика, источник и дата снизу. */
export default function ChartFrame({
  question,
  lead,
  unit,
  actions,
  source,
  sourceNote,
  as: H = 'h3',
  id,
  className = '',
  children,
}: ChartFrameProps) {
  return (
    <figure id={id} className={`rounded-card border border-line bg-surface ${className}`}>
      <figcaption className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-5">
        <div className="min-w-0">
          <H className={H === 'h2' ? 'text-xl leading-tight sm:text-[22px]' : 'text-lg leading-snug'}>{question}</H>
          {lead && <p className="mt-1.5 max-w-prose text-[15px] leading-snug text-ink/80">{lead}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </figcaption>
      {unit && <p className="num px-4 pt-3 text-xs text-muted sm:px-6">{unit}</p>}
      <div className="px-1 pb-2 pt-1 sm:px-3">{children}</div>
      <SourceNote source={source} note={sourceNote} className="border-t border-line px-4 py-3 sm:px-6" />
    </figure>
  );
}

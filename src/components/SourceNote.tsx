import { ExternalLink } from 'lucide-react';
import type { SourceRef } from '../types';
import { DemoBadge } from './Badges';

import { texts } from '../content/texts';
import { formatDate } from '../lib/format';

const L_SOURCE = texts.common.source.label;
const L_SOURCES = texts.common.source.labelPlural;
const asOf = (date: string) => {
  const s = texts.common.source.dataAsOf(date);
  return s.charAt(0).toLowerCase() + s.slice(1);
};


export interface SourceNoteProps {
  /** Один источник или несколько (график с двумя рядами из разных источников) */
  source: SourceRef | SourceRef[];
  /** Дополнение после источника: «расчёт по профилю хозяйства» */
  note?: string;
  /** Не показывать бейдж демо — когда он уже стоит рядом (шапка карточки) */
  hideDemoBadge?: boolean;
  className?: string;
}

/** «Источник: Росстат / ЕМИСС · данные на 1 октября 2026» + ссылка + бейдж демо при demo: true. */
export default function SourceNote({ source, note, hideDemoBadge = false, className = '' }: SourceNoteProps) {
  const all = Array.isArray(source) ? source : [source];
  // Один источник с одной датой показываем один раз
  const list = all.filter((s, i) => all.findIndex((t) => t.source === s.source && t.updated_at === s.updated_at) === i);
  const anyDemo = list.some((s) => s.demo);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs leading-5 text-muted ${className}`}>
      <span className="min-w-0">
        <span className="font-medium text-ink/70">{list.length > 1 ? L_SOURCES : L_SOURCE}:</span>{' '}
        {list.map((s, i) => (
          <span key={`${s.source}-${i}`}>
            {i > 0 && <span aria-hidden> · </span>}
            {s.source_url ? (
              <a
                href={s.source_url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-line-strong underline-offset-2 hover:text-accent hover:decoration-accent"
              >
                {s.source}
                <ExternalLink size={11} className="ml-0.5 inline align-baseline" aria-hidden />
              </a>
            ) : (
              s.source
            )}
            <span className="num">
              {', '}
              {asOf(formatDate(s.updated_at, 'long'))}
            </span>
          </span>
        ))}
        {note && <span>. {note}</span>}
      </span>
      {anyDemo && !hideDemoBadge && <DemoBadge size="sm" />}
    </div>
  );
}

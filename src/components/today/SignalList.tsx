// Лента «Что изменилось»: статус (иконка + подпись + цвет), заголовок, текст языком фермера, рубли, источник.
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { texts } from '../../content/texts';
import { formatRub } from '../../lib/format';
import type { Signal } from '../../types';
import SourceNote from '../SourceNote';
import StatusTag, { STATUS_STYLE } from '../StatusTag';

export default function SignalList({ signals }: { signals: Signal[] }) {
  if (!signals.length) return <p className="text-sm text-muted">{texts.common.empty.noChanges}</p>;
  return (
    <ol className="divide-y divide-line border-y border-line">
      {signals.map((s, i) => (
        <li key={s.id} className="group relative py-4 sm:py-5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            <span className="num pt-0.5 text-sm font-semibold text-ochre">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusTag status={s.status} size="sm" />
                <h3 className="text-[15px]">{s.title}</h3>
              </div>
              <p className="mt-1.5 text-[15px] leading-snug text-ink/85">{s.text}</p>
              <SourceNote source={s.source} className="mt-2" />
            </div>
            {s.effectRub !== null && (
              <p
                className={`num col-start-2 mt-2 whitespace-nowrap text-[17px] font-semibold sm:col-start-3 sm:mt-0 sm:text-right ${STATUS_STYLE[s.status].text}`}
              >
                {formatRub(s.effectRub, { unit: s.effectUnit === '₽/га' ? '₽/га' : '₽', sign: true })}
              </p>
            )}
          </div>
          <Link
            to={s.link}
            className="col-start-2 ml-9 mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline sm:ml-10"
          >
            {texts.common.actions.more}
            <ChevronRight size={15} aria-hidden />
          </Link>
        </li>
      ))}
    </ol>
  );
}

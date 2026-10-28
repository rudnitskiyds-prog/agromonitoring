// «Полоса сезона»: сев → вегетация → уборка → продажи с отметкой текущей недели.
// Она же навигация по сезонности: фазы кликабельны.
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { texts } from '../content/texts';
import { formatDate, MONTHS_SHORT } from '../lib/format';
import type { SeasonPhase, SeasonPhaseId } from '../types';

const S = texts.seasonStrip;
export const PHASE_LABEL: Record<SeasonPhaseId, string> = {
  sowing: S.sowing,
  growing: S.growing,
  harvest: S.harvest,
  sales: S.sales,
};
const L_NOW = S.now;

const ORDER: SeasonPhaseId[] = ['sowing', 'growing', 'harvest', 'sales'];

// Цвета фаз — материалы поля, не статусы и не культуры.
const PHASE_FILL: Record<SeasonPhaseId, string> = {
  sowing: 'bg-line-strong/45', // пашня
  growing: 'bg-accent/25', // зелень
  harvest: 'bg-ochre/40', // спелый колос
  sales: 'bg-accent/10', // склад
};
const PHASE_DOT: Record<SeasonPhaseId, string> = {
  sowing: 'bg-line-strong',
  growing: 'bg-accent',
  harvest: 'bg-ochre',
  sales: 'bg-accent/40',
};

const YEAR = 365;
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** 'MM-DD' → день года 0…364 (без високосного — для полосы это неважно) */
function doy(mmdd: string): number {
  const m = Number(mmdd.slice(0, 2)) - 1;
  const d = Number(mmdd.slice(3, 5));
  return CUM[m] + Math.min(d, 31) - 1;
}
const mod = (n: number) => ((n % YEAR) + YEAR) % YEAR;

function isoWeek(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThu.getTime()) / 864e5 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

/** 'MM-DD' → «20 сентября» (год-заглушка невисокосный: 02-29 не встречается в календаре работ) */
const fmtMmdd = (mmdd: string) => formatDate(`2001-${mmdd}`, 'dayMonth');

export interface SeasonStripProps {
  phases: SeasonPhase[];
  /** Текущая дата 'YYYY-MM-DD' — отметка недели */
  date: string;
  /** Подпись слева: «Пшеница озимая, Кубань» */
  caption?: string;
  /** Выделенная фаза (например, выбранная в фильтре сезонности) */
  activePhase?: SeasonPhaseId;
  /** Клик по фазе — навигация по сезонности */
  onSelect?: (id: SeasonPhaseId) => void;
  /** Или ссылки фаз (путь роутера) */
  links?: Partial<Record<SeasonPhaseId, string>>;
  className?: string;
}

interface PhaseElProps {
  id: SeasonPhaseId;
  className: string;
  children: ReactNode;
  label: string;
  highlight?: SeasonPhaseId;
  links?: Partial<Record<SeasonPhaseId, string>>;
  onSelect?: (id: SeasonPhaseId) => void;
  style?: CSSProperties;
}

function PhaseEl({ id, className: c, children, label, highlight, links, onSelect, style }: PhaseElProps) {
  const to = links?.[id];
  if (to)
    return (
      <Link to={to} className={c} style={style} aria-label={label} aria-current={id === highlight ? 'step' : undefined}>
        {children}
      </Link>
    );
  if (onSelect)
    return (
      <button type="button" onClick={() => onSelect(id)} className={c} style={style} aria-label={label} aria-pressed={id === highlight}>
        {children}
      </button>
    );
  return (
    <div className={c} style={style} title={label}>
      {children}
    </div>
  );
}

export default function SeasonStrip({ phases, date, caption, activePhase, onSelect, links, className = '' }: SeasonStripProps) {
  const model = useMemo(() => {
    const sorted = ORDER.map((id) => phases.find((p) => p.id === id)).filter((p): p is SeasonPhase => !!p);
    if (!sorted.length) return null;
    const origin = doy(sorted[0].from);
    const segs = sorted.map((p) => {
      const start = mod(doy(p.from) - origin);
      const len = mod(doy(p.to) - doy(p.from)) + 1;
      return { ...p, start, len };
    });
    const now = mod(doy(date.slice(5, 10)) - origin);
    const current = segs.find((s) => now >= s.start && now < s.start + s.len)?.id;
    // Метки месяцев от начала сезона
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = (Number(sorted[0].from.slice(0, 2)) - 1 + i) % 12;
      return { m, pos: mod(CUM[m] - origin) };
    }).sort((a, b) => a.pos - b.pos);
    return { segs, now, current, months };
  }, [phases, date]);

  if (!model) return null;
  const { segs, now, current, months } = model;
  const nowPct = (now / YEAR) * 100;
  const week = isoWeek(date);
  const highlight = activePhase ?? current;

  const interactive = !!onSelect || !!links;
  return (
    <div className={`w-full ${className}`}>
      {caption && <p className="kicker mb-2">{caption}</p>}

      {/* Дорожка с отметкой «сейчас» */}
      <div className="relative pt-7">
        <div
          className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${nowPct}%` }}
        >
          <span
            className={`num whitespace-nowrap rounded-tag bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-bg ${
              nowPct < 12 ? 'translate-x-[40%]' : nowPct > 88 ? '-translate-x-[40%]' : ''
            }`}
          >
            {S.nowWeek(String(week))}
          </span>
        </div>

        <div className="relative flex h-11 w-full overflow-hidden rounded-control border border-line bg-surface-2">
          {segs.map((s) => {
            const label = `${PHASE_LABEL[s.id]}: ${fmtMmdd(s.from)} – ${fmtMmdd(s.to)}`;
            const on = s.id === highlight;
            return (
              <PhaseEl
                key={s.id}
                id={s.id}
                label={label}
                style={{ width: `${(s.len / YEAR) * 100}%` }}
                highlight={highlight}
                links={links}
                onSelect={onSelect}
                className={`group relative flex h-full min-w-0 shrink-0 items-center border-r border-bg/70 px-2 text-left last:border-r-0 ${
                  PHASE_FILL[s.id]
                } ${interactive ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-125' : ''} ${
                  on ? 'shadow-[inset_0_-3px_0_rgb(var(--ink))]' : ''
                }`}
              >
                <span
                  className={`hidden truncate text-[13px] sm:block ${on ? 'font-semibold text-ink' : 'font-medium text-ink/75'}`}
                  style={{ width: '100%' }}
                >
                  {PHASE_LABEL[s.id]}
                </span>
              </PhaseEl>
            );
          })}
          {/* бороздки — штриховка «пашни» по всей дорожке */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, transparent 0 7px, rgb(var(--bg) / 0.35) 7px 8px)',
            }}
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-6 z-10 w-0.5 -translate-x-1/2 bg-ink"
          style={{ left: `${nowPct}%` }}
        />
      </div>

      {/* Месяцы */}
      <div className="num relative mt-1.5 h-4 text-[11px] text-muted" aria-hidden>
        {months.map(({ m, pos }, i) => (
          <span
            key={m}
            className={`absolute top-0 -translate-x-1/2 ${i % 2 ? 'hidden sm:inline' : ''}`}
            style={{ left: `${(pos / YEAR) * 100}%` }}
          >
            {pos === 0 ? '' : MONTHS_SHORT[m]}
          </span>
        ))}
      </div>

      {/* Легенда фаз: на телефоне — основная навигация, на десктопе — даты */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {segs.map((s) => {
          const on = s.id === highlight;
          return (
            <li key={s.id} className="min-w-0">
              <PhaseEl
                id={s.id}
                highlight={highlight}
                links={links}
                onSelect={onSelect}
                label={`${PHASE_LABEL[s.id]}: ${fmtMmdd(s.from)} – ${fmtMmdd(s.to)}`}
                className={`flex w-full items-start gap-2 rounded-tag text-left ${interactive ? 'hover:text-accent' : ''}`}
              >
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PHASE_DOT[s.id]}`} />
                <span className="min-w-0">
                  <span className={`block text-sm ${on ? 'font-semibold text-ink' : 'text-ink/80'}`}>
                    {PHASE_LABEL[s.id]}
                    {s.id === current && <span className="ml-1.5 text-xs font-normal text-muted">· {L_NOW.toLowerCase()}</span>}
                  </span>
                  <span className="num block text-xs text-muted">
                    {fmtMmdd(s.from)} – {fmtMmdd(s.to)}
                  </span>
                </span>
              </PhaseEl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

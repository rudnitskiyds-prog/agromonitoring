// «Полоса сезона»: сев → вегетация → уборка, и отдельным слоем — продажи, с отметкой текущей недели.
// Она же навигация по сезонности: фазы кликабельны.
//
// Правило пересечений: текущая фаза — агрономическая (сев/вегетация/уборка). «Продажи» могут идти
// одновременно с севом или уборкой — они на своей дорожке и не перекрывают поле.
// Дата вне агрономических фаз — «межсезонье» без активной фазы.
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

const AGRO: SeasonPhaseId[] = ['sowing', 'growing', 'harvest'];
const ORDER: SeasonPhaseId[] = ['sowing', 'growing', 'harvest', 'sales'];

// Цвета фаз — материалы поля, не статусы и не культуры.
const PHASE_FILL: Record<SeasonPhaseId, string> = {
  sowing: 'bg-line-strong/50', // пашня
  growing: 'bg-accent/25', // зелень
  harvest: 'bg-ochre/40', // спелый колос
  sales: 'bg-ink/15', // склад
};
const PHASE_DOT: Record<SeasonPhaseId, string> = {
  sowing: 'bg-line-strong',
  growing: 'bg-accent',
  harvest: 'bg-ochre',
  sales: 'bg-ink/40',
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
  /** Подпись сверху: «Пшеница озимая, Кубань» */
  caption?: string;
  /** Выделенная фаза (например, выбранная в фильтре сезонности) */
  activePhase?: SeasonPhaseId;
  /** Клик по фазе — навигация по сезонности */
  onSelect?: (id: SeasonPhaseId) => void;
  /** Или ссылки фаз (путь роутера) */
  links?: Partial<Record<SeasonPhaseId, string>>;
  className?: string;
}

export interface SeasonNow {
  /** Агрономическая фаза на дату; null — межсезонье */
  phase: Exclude<SeasonPhaseId, 'sales'> | null;
  /** Идут ли продажи на дату (параллельный слой) */
  sales: boolean;
  week: number;
}

/** Где мы в сезоне на дату — по тому же правилу, что и полоса. */
export function seasonNow(phases: SeasonPhase[], date: string): SeasonNow {
  const t = doy(date.slice(5, 10));
  const inside = (p: SeasonPhase) => mod(t - doy(p.from)) <= mod(doy(p.to) - doy(p.from));
  const agro = phases.find((p) => AGRO.includes(p.id) && inside(p));
  const sales = phases.find((p) => p.id === 'sales');
  return {
    phase: (agro?.id as SeasonNow['phase']) ?? null,
    sales: sales ? inside(sales) : false,
    week: isoWeek(date),
  };
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
  /** Не дублировать в порядке табуляции (повторный кусок фазы, перешедшей через край полосы) */
  hiddenFromTab?: boolean;
}

function PhaseEl({ id, className: c, children, label, highlight, links, onSelect, style, hiddenFromTab }: PhaseElProps) {
  const to = links?.[id];
  const tab = hiddenFromTab ? { tabIndex: -1, 'aria-hidden': true as const } : {};
  if (to)
    return (
      <Link to={to} className={c} style={style} aria-label={label} aria-current={id === highlight ? 'step' : undefined} {...tab}>
        {children}
      </Link>
    );
  if (onSelect)
    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={c}
        style={style}
        aria-label={label}
        aria-pressed={id === highlight}
        {...tab}
      >
        {children}
      </button>
    );
  return (
    <div className={c} style={style} title={label}>
      {children}
    </div>
  );
}

/** Куски фазы на полосе в процентах; фаза через край полосы режется на два. */
function pieces(start: number, len: number): Array<{ left: number; width: number }> {
  const end = start + len;
  if (end <= YEAR) return [{ left: (start / YEAR) * 100, width: (len / YEAR) * 100 }];
  return [
    { left: (start / YEAR) * 100, width: ((YEAR - start) / YEAR) * 100 },
    { left: 0, width: ((end - YEAR) / YEAR) * 100 },
  ];
}

export default function SeasonStrip({ phases, date, caption, activePhase, onSelect, links, className = '' }: SeasonStripProps) {
  const model = useMemo(() => {
    const sorted = ORDER.map((id) => phases.find((p) => p.id === id)).filter((p): p is SeasonPhase => !!p);
    if (!sorted.length) return null;
    // Полоса начинается с сева (или с первой фазы)
    const origin = doy(sorted[0].from);
    const segs = sorted.map((p) => {
      const start = mod(doy(p.from) - origin);
      const len = mod(doy(p.to) - doy(p.from)) + 1;
      return { ...p, start, len, parts: pieces(start, len) };
    });
    const now = mod(doy(date.slice(5, 10)) - origin);
    const months = Array.from({ length: 12 }, (_, i) => {
      const m = (Number(sorted[0].from.slice(0, 2)) - 1 + i) % 12;
      return { m, pos: mod(CUM[m] - origin) };
    }).sort((a, b) => a.pos - b.pos);
    return { segs, now, months, state: seasonNow(phases, date) };
  }, [phases, date]);

  if (!model) return null;
  const { segs, now, months, state } = model;
  const nowPct = ((now + 0.5) / YEAR) * 100;
  const highlight = activePhase ?? state.phase ?? undefined;
  const interactive = !!onSelect || !!links;
  const agroSegs = segs.filter((s) => s.id !== 'sales');
  const salesSeg = segs.find((s) => s.id === 'sales');
  const rangeLabel = (s: SeasonPhase) => `${PHASE_LABEL[s.id]}: ${fmtMmdd(s.from)} – ${fmtMmdd(s.to)}`;
  const common = { highlight, links, onSelect };
  const hover = interactive ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-125' : '';

  return (
    <div className={`w-full ${className}`}>
      {caption && <p className="kicker mb-2">{caption}</p>}

      <div className="relative pt-7">
        {/* Метка «сейчас» */}
        <div className="pointer-events-none absolute top-0 z-20 -translate-x-1/2" style={{ left: `${nowPct}%` }}>
          <span
            className={`num block whitespace-nowrap rounded-tag bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-bg ${
              nowPct < 14 ? 'translate-x-[42%]' : nowPct > 86 ? '-translate-x-[42%]' : ''
            }`}
          >
            {S.nowWeek(String(state.week))}
          </span>
        </div>

        {/* Дорожка 1: работы в поле */}
        <div className="relative h-11 w-full overflow-hidden rounded-control border border-line bg-surface-2">
          {/* бороздки межсезонья видны там, где нет фаз */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 6px, rgb(var(--line) / 0.7) 6px 7px)' }}
          />
          {agroSegs.map((s) =>
            s.parts.map((part, i) => {
              const on = s.id === highlight;
              return (
                <PhaseEl
                  key={`${s.id}-${i}`}
                  id={s.id}
                  label={rangeLabel(s)}
                  {...common}
                  hiddenFromTab={i > 0}
                  style={{ left: `${part.left}%`, width: `${part.width}%` }}
                  className={`absolute inset-y-0 flex min-w-0 items-center overflow-hidden border-r border-bg/70 px-2 text-left ${
                    PHASE_FILL[s.id]
                  } ${hover} ${on ? 'shadow-[inset_0_-3px_0_rgb(var(--ink))]' : ''}`}
                >
                  {i === 0 && (
                    <span className={`hidden truncate text-[13px] sm:block ${on ? 'font-semibold text-ink' : 'font-medium text-ink/75'}`}>
                      {PHASE_LABEL[s.id]}
                    </span>
                  )}
                </PhaseEl>
              );
            }),
          )}
        </div>

        {/* Дорожка 2: продажи — параллельный слой */}
        {salesSeg && (
          <div className="relative mt-1 h-5 w-full">
            {salesSeg.parts.map((part, i) => (
              <PhaseEl
                key={`sales-${i}`}
                id="sales"
                label={`${rangeLabel(salesSeg)}. ${S.salesLayer}`}
                {...common}
                hiddenFromTab={i > 0}
                style={{ left: `${part.left}%`, width: `${part.width}%` }}
                className={`absolute inset-y-0 flex items-center overflow-hidden rounded-tag px-1.5 text-left ${PHASE_FILL.sales} ${hover} ${
                  activePhase === 'sales' ? 'ring-1 ring-ink' : ''
                }`}
              >
                {i === 0 && <span className="hidden truncate text-[11px] font-medium text-ink/75 sm:block">{S.sales}</span>}
              </PhaseEl>
            ))}
          </div>
        )}

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

      {/* Где мы сейчас */}
      <p className="mt-3 text-sm text-ink">
        <span className="font-semibold">
          {state.phase ? S.current(PHASE_LABEL[state.phase].toLowerCase(), String(state.week)) : S.offSeason}
        </span>
        {state.phase && state.sales && <span className="text-muted"> · {S.salesLayerShort.toLowerCase()}</span>}
        {!state.phase && <span className="block text-muted">{S.offSeasonHint}</span>}
      </p>

      {/* Легенда фаз: на телефоне — основная навигация, на десктопе — даты */}
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {segs.map((s) => {
          const on = s.id === highlight;
          const isNow = s.id === 'sales' ? state.sales : s.id === state.phase;
          return (
            <li key={s.id} className="min-w-0">
              <PhaseEl
                id={s.id}
                {...common}
                label={rangeLabel(s)}
                className={`flex w-full items-start gap-2 rounded-tag text-left ${interactive ? 'hover:text-accent' : ''}`}
              >
                <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PHASE_DOT[s.id]}`} />
                <span className="min-w-0">
                  <span className={`block text-sm ${on ? 'font-semibold text-ink' : 'text-ink/80'}`}>
                    {PHASE_LABEL[s.id]}
                    {isNow && <span className="ml-1.5 text-xs font-normal text-muted">· {S.now.toLowerCase()}</span>}
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

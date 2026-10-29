// «Сколько дождя выпало по месяцам сезона» — строки журнала: факт против нормы.
// Неполный месяц (ERA5 ещё не закрыл его) показан штриховкой и с нормой не сравнивается.
import { CircleMinus, CloudRain, TriangleAlert } from 'lucide-react';
import { texts } from '../../content/texts';
import { MONTHS_NOM, formatDate, formatNumber, formatPct } from '../../lib/format';
import type { SourceRef } from '../../types';
import SourceNote from '../SourceNote';
import StatusTag from '../StatusTag';
import type { SeasonMonthRow, WeatherCause, YearMonth, YearRange } from '../../lib/climate';

const F = texts.why.factorCause;
const L = texts.harvest.rainLedger;
/** Месяц считаем сухим, если осадков меньше нормы больше чем на треть. */
const DRY_PCT = -30;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mm = (v: number) => formatNumber(v, 0);
const pctAbs = (v: number) => formatPct(Math.abs(v), { sign: false, fractionDigits: 0 });

export interface RainLedgerProps {
  rows: SeasonMonthRow[];
  year: number;
  range: YearRange;
  /** Последний учтённый день ERA5 */
  dataTo: string;
  source: SourceRef;
  /** Критическое окно: месяц перед уборкой и уборка (criticalWindow из lib/climate) */
  critical: YearMonth[];
  /** Главная погодная причина в критическом окне (mainWeatherCause); null — явной нет */
  cause: WeatherCause | null;
}

export default function RainLedger({ rows, year, range, dataTo, source, critical, cause }: RainLedgerProps) {
  const scale = Math.max(1, ...rows.flatMap((r) => [r.value ?? 0, r.norm ?? 0]));
  const from = String(range.from);
  const to = String(range.to);
  const criticalKeys = new Set(critical.map((c) => `${c.year}-${String(c.month).padStart(2, '0')}-01`));
  const causeMonth = cause ? MONTHS_NOM[cause.month - 1] : '';
  const causePct = cause ? pctAbs(cause.deviationPct) : '';

  return (
    <section aria-labelledby="rain-ledger-title" className="rounded-card border border-line bg-surface">
      <div className="px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 id="rain-ledger-title" className="text-xl leading-tight sm:text-[22px]">
          {L.title(String(year))}
        </h2>
        <p className="mt-1.5 max-w-prose text-[15px] leading-snug text-ink/80">{L.lead(from, to)}</p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-hidden>
          <li className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 rounded-[2px] bg-accent" />
            {L.legendFact}
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-1 rounded-full bg-ochre" />
            {L.legendGrainFill}
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-0.5 bg-ink" />
            {L.legendNorm}, {L.norm(from, to).toLowerCase()}
          </li>
        </ul>
      </div>

      <ol className="mt-3 divide-y divide-line border-y border-line">
        {rows.map((r) => {
          const name = cap(MONTHS_NOM[r.month - 1]);
          const dry = r.deviationPct !== null && r.deviationPct <= DRY_PCT;
          let phrase: string;
          if (r.incomplete) phrase = F.monthIncomplete(name, formatDate(dataTo, 'dayMonth'));
          else if (r.value === null || r.norm === null) phrase = `${name}: —`;
          else if ((r.deviationPct ?? 0) < 0) phrase = F.rainMonthBelow(name, mm(r.value), mm(r.norm), pctAbs(r.deviationPct ?? 0));
          else phrase = F.rainMonthAbove(name, mm(r.value), mm(r.norm), pctAbs(r.deviationPct ?? 0));
          const isCritical = criticalKeys.has(r.date);
          return (
            <li
              key={r.month}
              className={`relative ${isCritical ? 'bg-ochre-soft/40' : ''}`}
            >
              {isCritical && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-ochre" />}
              <div
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.25fr)] sm:px-6"
            >
              <span className="text-sm font-semibold">{name}</span>
              {/* шкала: факт — полоса, норма — риска */}
              <div className="relative h-5" aria-hidden>
                <div className="absolute inset-y-1.5 left-0 right-0 rounded-tag bg-surface-2" />
                {r.value !== null && (
                  <div
                    className={`absolute inset-y-1 left-0 rounded-tag ${r.incomplete ? '' : 'bg-accent'}`}
                    style={{
                      width: `${(r.value / scale) * 100}%`,
                      ...(r.incomplete
                        ? {
                            backgroundImage:
                              'repeating-linear-gradient(135deg, rgb(var(--accent) / 0.55) 0 4px, transparent 4px 7px)',
                            border: '1px dashed rgb(var(--accent))',
                          }
                        : {}),
                    }}
                  />
                )}
                {r.norm !== null && (
                  <div className="absolute -inset-y-0.5 w-0.5 bg-ink" style={{ left: `calc(${(r.norm / scale) * 100}% - 1px)` }} />
                )}
              </div>
              <p className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug text-ink/85 sm:col-span-1">
                <span className="num">{phrase}</span>
                {dry && <StatusTag status="worse" label={L.dry} size="sm" />}
                {r.incomplete && (
                  <span className="inline-flex h-5 items-center rounded-tag border border-dashed border-line-strong px-1.5 text-[11px] font-medium text-muted">
                    {L.incomplete}
                  </span>
                )}
              </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="flex items-start gap-2.5 px-4 py-4 text-[15px] leading-snug sm:px-6">
        {cause?.kind === 'dry' ? (
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ink" aria-hidden />
        ) : cause?.kind === 'wet' ? (
          <CloudRain size={18} className="mt-0.5 shrink-0 text-ink" aria-hidden />
        ) : (
          <CircleMinus size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        )}
        <span>
          {cause?.kind === 'dry'
            ? F.mainDry(causeMonth, causePct)
            : cause?.kind === 'wet'
              ? F.mainWet(causeMonth, causePct)
              : F.noMainCause}
        </span>
      </p>
      <p className="px-4 pb-3 text-xs text-muted sm:px-6">
        {L.dryHint(formatPct(Math.abs(DRY_PCT), { sign: false, fractionDigits: 0 }))} {L.dataTo(formatDate(dataTo, 'long'))}.
      </p>
      <SourceNote source={source} className="border-t border-line px-4 py-3 sm:px-6" />
    </section>
  );
}

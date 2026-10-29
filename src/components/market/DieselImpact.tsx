// «Во сколько хозяйству обошлась солярка за месяц»: лист журнала рядом с недельным графиком дизеля.
// Числа приходят готовыми (factorAnalysis + computeCropEconomics из src/lib/finance.ts).
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { CROPS } from '../../config/regions';
import { texts } from '../../content/texts';
import { formatNumber, formatPct, formatRub } from '../../lib/format';
import type { CropId, SignalStatus, SourceRef } from '../../types';
import { AssumptionBadge } from '../Badges';
import SourceNote from '../SourceNote';
import StatusTag from '../StatusTag';

const U = texts.common.units;
const L = texts.market.dieselImpact;

export interface DieselImpactRow {
  crop: CropId;
  areaHa: number;
  effectPerHa: number;
  effectTotal: number;
  /** ₽/т; null при нулевой урожайности */
  effectPerT: number | null;
  fuelSharePct: number;
  litersPerHa: number;
  litersAssumption: boolean;
}

export interface DieselImpactProps {
  rows: DieselImpactRow[] | null;
  total: number;
  changePct: number | null;
  changeText: string;
  priceNow: number;
  sources: SourceRef[];
  /** Выбран не регион хозяйства — рубли не считаем */
  otherRegion?: boolean;
  className?: string;
}

function effectStatus(v: number): SignalStatus {
  if (Math.abs(v) < 1) return 'normal';
  return v > 0 ? 'better' : 'worse';
}

export default function DieselImpact({ rows, total, changePct, changeText, priceNow, sources, otherRegion, className = '' }: DieselImpactProps) {
  const Arrow = changePct == null || Math.abs(changePct) < 0.05 ? Minus : changePct > 0 ? ArrowUpRight : ArrowDownRight;
  const status = effectStatus(total);
  return (
    <section
      aria-labelledby="diesel-impact-title"
      className={`paper-ruled relative flex h-full flex-col overflow-hidden rounded-sheet border border-line bg-surface shadow-raise ${className}`}
    >
      <span aria-hidden className="absolute inset-y-0 left-8 w-px bg-status-worse/25" />
      <div className="relative flex flex-1 flex-col py-5 pl-12 pr-5">
        <h3 id="diesel-impact-title" className="text-lg leading-snug">
          {L.title}
        </h3>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num whitespace-nowrap text-sm text-muted">
            {L.priceNow}: <b className="font-semibold text-ink">{formatNumber(priceNow, 2)} {U.rubPerL}</b>
          </span>
          <span className="num inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-ink">
            <Arrow size={15} aria-hidden />
            {changeText}
          </span>
        </div>

        {otherRegion || !rows ? (
          <p className="mt-4 text-sm leading-relaxed text-ink/80">{L.otherRegion}</p>
        ) : (
          <>
            <p className="kicker mt-5">{L.farmTotal}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="num-display text-[34px] font-semibold leading-none sm:text-[38px]">
                {formatRub(total, { sign: true })}
              </p>
              <StatusTag status={status} size="sm" />
            </div>

            <ul className="mt-5 divide-y divide-line border-y border-line">
              {rows.map((r) => (
                <li key={r.crop} className="py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: `rgb(var(${CROPS[r.crop].colorVar}))` }}
                    />
                    {CROPS[r.crop].name}
                    <span className="num font-normal text-muted">
                      · {formatNumber(r.areaHa)} {U.ha}
                    </span>
                  </p>
                  <dl className="num mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">{L.perHa}</dt>
                      <dd className="mt-0.5 whitespace-nowrap font-semibold">{formatRub(r.effectPerHa, { sign: true, unit: '₽/га' })}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">{L.perT}</dt>
                      <dd className="mt-0.5 whitespace-nowrap font-semibold">
                        {r.effectPerT == null ? '—' : formatRub(r.effectPerT, { sign: true, unit: '₽/т' })}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">{L.share}</dt>
                      <dd className="mt-0.5 whitespace-nowrap font-semibold">{formatPct(r.fuelSharePct, { sign: false, fractionDigits: 0 })}</dd>
                    </div>
                  </dl>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="num">{L.liters(formatNumber(r.litersPerHa))}</span>
                    {r.litersAssumption && <AssumptionBadge size="sm" />}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted">{L.note}</p>
          </>
        )}
        <SourceNote source={sources} className="mt-auto pt-3" />
      </div>
    </section>
  );
}

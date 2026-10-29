// Водопад вкладов (цепные подстановки): маржа базового сезона → вклады факторов → маржа текущего.
// Свой HTML-рендер вместо Recharts: столбцы — кнопки (клик открывает drill-down), одна ось значений.
// Десктоп — вертикальные столбцы, телефон — те же данные строками (без горизонтальной прокрутки).
import { ChevronRight } from 'lucide-react';
import { texts } from '../../content/texts';
import { formatNumber, formatRub } from '../../lib/format';
import type { FactorAnalysis, FactorId, SignalStatus } from '../../types';
import { STATUS_LABEL, STATUS_STYLE } from '../StatusTag';

export type WaterfallMode = 'perHa' | 'farm';

interface Column {
  key: string;
  factor: FactorId | null;
  label: string;
  /** Уровень до и после столбца */
  from: number;
  to: number;
  /** Подпись значения: для итогов — уровень, для вкладов — сам вклад */
  value: number;
  total: boolean;
  status: SignalStatus | null;
}

const F = texts.factors;
const FACTOR_NAME: Record<FactorId, string> = {
  price: F.price.name,
  yield: F.yield.name,
  diesel: F.diesel.name,
  otherCosts: F.otherCosts.name,
};

export const statusOfEffect = (v: number): SignalStatus => (v > 0.5 ? 'better' : v < -0.5 ? 'worse' : 'normal');

export function formatMoney(v: number, mode: WaterfallMode, sign = false): string {
  return mode === 'perHa' ? formatRub(v, { unit: '₽/га', sign }) : formatRub(v, { compact: true, sign });
}

function buildColumns(a: FactorAnalysis, mode: WaterfallMode): Column[] {
  const k = mode === 'perHa' ? 1 : a.areaHa;
  const cols: Column[] = [];
  const start = a.baseMarginPerHa * k;
  cols.push({ key: 'start', factor: null, label: a.base.label, from: 0, to: start, value: start, total: true, status: null });
  let level = start;
  for (const c of a.contributions) {
    const eff = (mode === 'perHa' ? c.effectPerHa : c.effectTotal) || 0;
    cols.push({
      key: c.factor,
      factor: c.factor,
      label: FACTOR_NAME[c.factor],
      from: level,
      to: level + eff,
      value: eff,
      total: false,
      status: statusOfEffect(c.effectPerHa),
    });
    level += eff;
  }
  const end = a.currentMarginPerHa * k;
  cols.push({ key: 'end', factor: null, label: a.current.label, from: 0, to: end, value: end, total: true, status: null });
  return cols;
}

/** «Красивые» деления оси: шаг 1/2/2,5/5 × 10^n. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : v);
  return out;
}

export interface WaterfallProps {
  analysis: FactorAnalysis;
  mode: WaterfallMode;
  selected: FactorId | null;
  onSelect: (f: FactorId) => void;
}

export default function Waterfall({ analysis, mode, selected, onSelect }: WaterfallProps) {
  const cols = buildColumns(analysis, mode);
  const levels = cols.flatMap((c) => [c.from, c.to]);
  const ticks = niceTicks(Math.min(0, ...levels), Math.max(0, ...levels));
  const lo = Math.min(ticks[0], ...levels);
  const hi = Math.max(ticks[ticks.length - 1], ...levels);
  // Запас сверху и снизу под подписи значений
  const pad = (hi - lo) * 0.14;
  const dMin = lo < 0 ? lo - pad : lo;
  const dMax = hi + pad;
  const pct = (v: number) => ((v - dMin) / (dMax - dMin)) * 100;
  const tickLabel = (v: number) => (mode === 'perHa' ? formatNumber(v) : formatRub(v, { compact: true }).replace(/\s?₽$/, ''));
  const unit = mode === 'perHa' ? texts.common.units.rubPerHa : texts.common.units.rub;

  return (
    <div className="num">
      {/* ── Десктоп и планшет: вертикальные столбцы ── */}
      <div className="hidden sm:block">
        <p className="mb-2 pl-1 text-xs text-muted">{unit}</p>
        <div className="flex">
          {/* ось значений — одна */}
          <div className="relative h-[280px] w-16 shrink-0" aria-hidden>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-2 translate-y-1/2 whitespace-nowrap text-[11.5px] text-muted"
                style={{ bottom: `${pct(t)}%` }}
              >
                {tickLabel(t)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            {/* сетка */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[280px]" aria-hidden>
              {ticks.map((t) => (
                <span
                  key={t}
                  className={`absolute inset-x-0 border-t ${t === 0 ? 'border-line-strong' : 'border-grid'}`}
                  style={{ bottom: `${pct(t)}%` }}
                />
              ))}
            </div>
            <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
              {cols.map((c, i) => (
                <li key={c.key} className="min-w-0">
                  <ColumnButton
                    col={c}
                    mode={mode}
                    pct={pct}
                    selected={c.factor !== null && c.factor === selected}
                    first={i === 0}
                    last={i === cols.length - 1}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* ── Телефон: строки ── */}
      <ol className="space-y-1 sm:hidden">
        {cols.map((c) => (
          <li key={c.key}>
            <RowButton col={c} mode={mode} pct={pct} selected={c.factor !== null && c.factor === selected} onSelect={onSelect} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function barClass(c: Column): string {
  if (c.total) return 'bg-muted/45 dark:bg-muted/40';
  if (c.status === 'better') return 'bg-status-better';
  if (c.status === 'worse') return 'bg-status-worse';
  return 'bg-status-normal';
}

function ValueText({ col, mode, className = '' }: { col: Column; mode: WaterfallMode; className?: string }) {
  if (col.total) return <span className={`font-semibold text-ink ${className}`}>{formatMoney(col.value, mode)}</span>;
  const s = STATUS_STYLE[col.status ?? 'normal'];
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${s.text} ${className}`}>
      <s.Icon size={13} strokeWidth={2.25} aria-hidden />
      {formatMoney(col.value, mode, true)}
    </span>
  );
}

function ariaFor(col: Column, mode: WaterfallMode): string {
  if (col.total) return `${col.label}: ${formatMoney(col.value, mode)}`;
  return `${col.label}: ${formatMoney(col.value, mode, true)}, ${STATUS_LABEL[col.status ?? 'normal'].toLowerCase()}. ${texts.why.waterfall.clickHint}`;
}

function ColumnButton({
  col,
  mode,
  pct,
  selected,
  first,
  last,
  onSelect,
}: {
  col: Column;
  mode: WaterfallMode;
  pct: (v: number) => number;
  selected: boolean;
  first: boolean;
  last: boolean;
  onSelect: (f: FactorId) => void;
}) {
  const lo = Math.min(col.from, col.to);
  const hi = Math.max(col.from, col.to);
  const up = col.total ? col.to >= 0 : col.value >= 0;
  const body = (
    <>
      <span className="relative block h-[280px]">
        {/* соединители: уровень до столбца и после */}
        {!first && (
          <span aria-hidden className="absolute left-0 w-[22%] border-t border-dashed border-line-strong" style={{ bottom: `${pct(col.from)}%` }} />
        )}
        {!last && (
          <span aria-hidden className="absolute right-0 w-[22%] border-t border-dashed border-line-strong" style={{ bottom: `${pct(col.to)}%` }} />
        )}
        <span
          aria-hidden
          className={`absolute left-[22%] right-[22%] min-h-[2px] rounded-[2px] ${barClass(col)} ${
            selected ? 'outline outline-2 outline-offset-2 outline-accent' : ''
          }`}
          style={{ bottom: `${pct(lo)}%`, height: `${pct(hi) - pct(lo)}%` }}
        />
        <span
          className="absolute inset-x-0 flex justify-center whitespace-nowrap text-[12.5px] leading-none"
          style={up ? { bottom: `calc(${pct(hi)}% + 7px)` } : { top: `calc(${100 - pct(lo)}% + 7px)` }}
        >
          <ValueText col={col} mode={mode} />
        </span>
      </span>
      <span
        className={`mt-2 flex min-h-[2.5rem] items-start justify-center gap-0.5 px-1 text-center text-[13px] leading-tight ${
          col.total ? 'text-muted' : selected ? 'font-semibold text-accent' : 'font-medium text-ink'
        }`}
      >
        {col.label}
        {!col.total && <ChevronRight size={14} className="mt-px shrink-0 opacity-60" aria-hidden />}
      </span>
    </>
  );
  if (col.total || !col.factor) return <div aria-label={ariaFor(col, mode)} role="img">{body}</div>;
  const f = col.factor;
  return (
    <button
      type="button"
      onClick={() => onSelect(f)}
      aria-pressed={selected}
      aria-label={ariaFor(col, mode)}
      className={`block w-full rounded-control transition-colors hover:bg-surface-2/60 ${selected ? 'bg-accent-soft/50' : ''}`}
    >
      {body}
    </button>
  );
}

function RowButton({
  col,
  mode,
  pct,
  selected,
  onSelect,
}: {
  col: Column;
  mode: WaterfallMode;
  pct: (v: number) => number;
  selected: boolean;
  onSelect: (f: FactorId) => void;
}) {
  const lo = Math.min(col.from, col.to);
  const hi = Math.max(col.from, col.to);
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className={`min-w-0 text-[14px] ${col.total ? 'text-muted' : selected ? 'font-semibold text-accent' : 'font-medium text-ink'}`}>
          {col.label}
        </span>
        <ValueText col={col} mode={mode} className="shrink-0 text-[14px]" />
      </span>
      <span className="relative mt-1.5 block h-3">
        {/* ноль оси */}
        <span aria-hidden className="absolute -inset-y-1 w-px bg-line-strong" style={{ left: `${pct(0)}%` }} />
        <span
          aria-hidden
          className={`absolute inset-y-0 min-w-[2px] rounded-[2px] ${barClass(col)}`}
          style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
        />
      </span>
    </>
  );
  const cls = `block w-full rounded-control px-0 py-2 text-left ${selected ? 'bg-accent-soft/50' : ''}`;
  if (col.total || !col.factor) return <div className={cls} role="img" aria-label={ariaFor(col, mode)}>{body}</div>;
  const f = col.factor;
  return (
    <button type="button" onClick={() => onSelect(f)} aria-pressed={selected} aria-label={ariaFor(col, mode)} className={cls}>
      {body}
    </button>
  );
}

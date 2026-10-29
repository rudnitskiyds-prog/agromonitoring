// Малый график «по годам» для ряда малых графиков (урожай, осадки, температура): общая шкала лет,
// одна ось Y, пунктир нормы с подписью, выделенный последний год, тултип.
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { DataPoint } from '../../types';
import { useTokenColors } from '../theme';

export interface YearMiniChartProps {
  /** Заголовок малого графика: «Осадки за сезон» */
  title: string;
  unit: string;
  points: DataPoint[];
  /** Общая шкала лет для всех малых графиков ряда */
  years: number[];
  kind: 'line' | 'bar';
  colorVar: string;
  norm: number | null;
  normLabel: string;
  formatValue: (v: number) => string;
  /** Строка под заголовком: «2026 к 2025: −22%» */
  note?: string;
  height?: number;
}

interface Row {
  year: string;
  value: number | null;
}

export default function YearMiniChart({
  title,
  unit,
  points,
  years,
  kind,
  colorVar,
  norm,
  normLabel,
  formatValue,
  note,
  height = 168,
}: YearMiniChartProps) {
  const c = useTokenColors({ s: colorVar, grid: '--grid', muted: '--muted', surface: '--surface', line: '--line-strong', ink: '--ink' });
  const rows: Row[] = years.map((y) => ({
    year: String(y),
    value: points.find((p) => p.date.startsWith(String(y)))?.value ?? null,
  }));
  let lastIdx = -1;
  rows.forEach((r, i) => {
    if (r.value !== null) lastIdx = i;
  });
  const last = lastIdx >= 0 ? rows[lastIdx] : null;
  const tick = { fill: c.muted, fontSize: 11, fontFamily: '"Golos Text", system-ui, sans-serif' };

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 px-2">
        <h4 className="text-sm font-semibold leading-snug">{title}</h4>
        <span className="num shrink-0 text-xs text-muted">{unit}</span>
      </div>
      <p className="num mt-0.5 min-h-[2.5rem] px-2 text-xs text-muted">
        {last?.value != null && (
          <>
            <b className="font-semibold text-ink">
              {last.year}: {formatValue(last.value)}
            </b>
            {note && <> · {note}</>}
          </>
        )}
        {norm !== null && (
          <span className="block">
            <span aria-hidden className="mr-1.5 inline-block w-3 border-t border-dashed border-muted align-middle" />
            {normLabel}: {formatValue(norm)}
          </span>
        )}
      </p>
      <div className="num" role="img" aria-label={`${title}, ${unit}`}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={rows} margin={{ top: 14, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="year"
              tick={tick}
              axisLine={{ stroke: c.line }}
              tickLine={false}
              interval={0}
              tickFormatter={(y: string) => `’${y.slice(2)}`}
              tickMargin={6}
            />
            <YAxis
              tick={tick}
              axisLine={false}
              tickLine={false}
              width={44}
              tickCount={4}
              domain={kind === 'bar' ? [0, 'auto'] : ['auto', 'auto']}
              tickFormatter={(v: number) => formatValue(v)}
            />
            <Tooltip
              isAnimationActive={false}
              cursor={kind === 'bar' ? { fill: c.grid, fillOpacity: 0.4 } : { stroke: c.line, strokeDasharray: '3 3' }}
              content={(p) => <MiniTooltip {...p} unit={unit} norm={norm} normLabel={normLabel} formatValue={formatValue} color={c.s} />}
            />
            {norm !== null && (
              <ReferenceLine
                y={norm}
                stroke={c.muted}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                ifOverflow="extendDomain"
              />
            )}
            {kind === 'bar' ? (
              <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                {rows.map((r, i) => (
                  <Cell key={r.year} fill={c.s} fillOpacity={i === lastIdx ? 1 : 0.38} />
                ))}
              </Bar>
            ) : (
              <Line
                dataKey="value"
                type="monotone"
                stroke={c.s}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls={false}
                activeDot={{ r: 3.5, fill: c.s, stroke: c.surface, strokeWidth: 2 }}
                dot={(p: { cx?: number; cy?: number; index?: number }) =>
                  p.index === lastIdx && p.cx != null && p.cy != null ? (
                    <g key="last">
                      <circle cx={p.cx} cy={p.cy} r={7} fill={c.s} opacity={0.18} />
                      <circle cx={p.cx} cy={p.cy} r={4} fill={c.s} stroke={c.surface} strokeWidth={2} />
                    </g>
                  ) : (
                    <circle key={`d-${p.index}`} cx={p.cx} cy={p.cy} r={2} fill={c.s} opacity={0.55} />
                  )
                }
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniTooltip({
  active,
  payload,
  unit,
  norm,
  normLabel,
  formatValue,
  color,
}: Pick<TooltipContentProps<number, string>, 'active'> & {
  payload?: ReadonlyArray<{ payload?: unknown }>;
  unit: string;
  norm: number | null;
  normLabel: string;
  formatValue: (v: number) => string;
  color: string;
}) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row || row.value === null) return null;
  return (
    <div className="num min-w-[150px] rounded-control border border-line bg-surface px-3 py-2 text-sm shadow-pop">
      <p className="mb-1 text-xs text-muted">{row.year}</p>
      <p className="flex items-center justify-between gap-4">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="font-semibold">
          {formatValue(row.value)} {unit}
        </span>
      </p>
      {norm !== null && (
        <p className="mt-1 flex justify-between gap-4 text-xs text-muted">
          <span>{normLabel}</span>
          <span>
            {formatValue(norm)} {unit}
          </span>
        </p>
      )}
    </div>
  );
}

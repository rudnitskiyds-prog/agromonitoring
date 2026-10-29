// Сезонный профиль цены за 5 лет: коридор min–max по месяцам, линия нормы, точка «сейчас».
// Одна ось Y (₽/т), цвет — культуры. Месяцы выбранной фазы сезона подсвечены (навигация полосой сезона).
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { texts } from '../../content/texts';
import { MONTHS_NOM, MONTHS_SHORT, formatNumber, formatRub } from '../../lib/format';
import type { SeasonalProfile } from '../../types';
import { useTokenColors } from '../theme';

const T = texts.market.seasonChart;
const L_NORM_SHORT = T.normShort;

interface Row {
  month: number;
  label: string;
  range: [number, number];
  norm: number;
  current: number | null;
  inPhase: boolean;
}

export interface SeasonalProfileChartProps {
  profile: SeasonalProfile;
  colorVar: string;
  /** Месяц и цена последней точки — «сейчас» */
  current?: { month: number; price: number } | null;
  /** Месяцы выбранной фазы полосы сезона (1–12) */
  phaseMonths?: number[];
  height?: number;
  ariaLabel?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function SeasonalProfileChart({
  profile,
  colorVar,
  current,
  phaseMonths = [],
  height = 260,
  ariaLabel,
}: SeasonalProfileChartProps) {
  const c = useTokenColors({ crop: colorVar, grid: '--grid', muted: '--muted', surface: '--surface', line: '--line-strong', ink: '--ink' });
  const rows: Row[] = profile.months.map((m) => ({
    month: m.month,
    label: MONTHS_SHORT[m.month - 1],
    range: [m.min, m.max],
    norm: m.normPrice,
    current: current && current.month === m.month ? current.price : null,
    inPhase: phaseMonths.includes(m.month),
  }));
  const tick = { fill: c.muted, fontSize: 12, fontFamily: '"Golos Text", system-ui, sans-serif' };

  return (
    <div className="num w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 22, right: 52, bottom: 4, left: 2 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="label"
            tick={tick}
            axisLine={{ stroke: c.line }}
            tickLine={false}
            interval={0}
            tickMargin={8}
            tickFormatter={(v: string, i: number) => (i % 2 === 1 && typeof window !== 'undefined' && window.innerWidth < 480 ? '' : v)}
          />
          <YAxis
            tick={tick}
            axisLine={false}
            tickLine={false}
            width={60}
            domain={['auto', 'auto']}
            tickCount={5}
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <Tooltip
            cursor={{ fill: c.grid, fillOpacity: 0.35 }}
            isAnimationActive={false}
            content={(p) => <ProfileTooltip {...p} color={c.crop} />}
          />
          <Bar dataKey="range" isAnimationActive={false} radius={2}>
            {rows.map((r) => (
              <Cell
                key={r.month}
                fill={c.crop}
                fillOpacity={r.current != null ? 0.42 : r.inPhase ? 0.3 : 0.14}
                stroke={r.current != null ? c.crop : 'none'}
                strokeWidth={r.current != null ? 1.5 : 0}
              />
            ))}
          </Bar>
          <Line
            dataKey="norm"
            type="monotone"
            stroke={c.crop}
            strokeWidth={2}
            strokeDasharray="5 4"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3.5, fill: c.crop, stroke: c.surface, strokeWidth: 2 }}
            label={(p: { x?: number | string; y?: number | string; index?: number }) =>
              p.index === rows.length - 1 ? (
                <text
                  key="norm-label"
                  x={Number(p.x) + 9}
                  y={Number(p.y)}
                  dy="0.35em"
                  fill={c.crop}
                  fontSize={12.5}
                  fontWeight={600}
                  paintOrder="stroke"
                  stroke={c.surface}
                  strokeWidth={4}
                  fontFamily='"Golos Text", system-ui, sans-serif'
                >
                  {L_NORM_SHORT}
                </text>
              ) : (
                <g key={`n-${p.index}`} />
              )
            }
          />
          <Line
            dataKey="current"
            stroke="none"
            isAnimationActive={false}
            activeDot={false}
            dot={(p: { cx?: number; cy?: number; index?: number; value?: unknown }) => {
              if (p.cx == null || p.cy == null || typeof p.value !== 'number') return <g key={`c-${p.index}`} />;
              return (
                <g key="current">
                  <circle cx={p.cx} cy={p.cy} r={8} fill={c.ink} opacity={0.14} />
                  <circle cx={p.cx} cy={p.cy} r={4.5} fill={c.ink} stroke={c.surface} strokeWidth={2} />
                  <text
                    x={p.cx}
                    y={p.cy - 14}
                    textAnchor="middle"
                    fill={c.ink}
                    fontSize={12.5}
                    fontWeight={600}
                    paintOrder="stroke"
                    stroke={c.surface}
                    strokeWidth={4}
                    fontFamily='"Golos Text", system-ui, sans-serif'
                  >
                    {texts.market.priceChart.current}
                  </text>
                </g>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProfileTooltip({
  active,
  payload,
  color,
}: Pick<TooltipContentProps<number, string>, 'active'> & {
  payload?: ReadonlyArray<{ payload?: unknown }>;
  color: string;
}) {
  const row = payload?.[0]?.payload as Row | undefined;
  if (!active || !row) return null;
  return (
    <div className="num min-w-[190px] rounded-control border border-line bg-surface px-3 py-2 text-sm shadow-pop">
      <p className="mb-1.5 text-xs text-muted">{cap(MONTHS_NOM[row.month - 1])}</p>
      <dl className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-ink/80">
            <span aria-hidden className="inline-block h-0.5 w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />
            {T.norm}
          </dt>
          <dd className="font-semibold">{formatRub(row.norm, { unit: '₽/т' })}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-2 text-ink/80">
            <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-[2px]" style={{ background: color, opacity: 0.3 }} />
            {T.range}
          </dt>
          <dd className="whitespace-nowrap">
            {formatNumber(row.range[0])} – {formatNumber(row.range[1])}
          </dd>
        </div>
        {row.current != null && (
          <div className="flex items-center justify-between gap-4 border-t border-line pt-1">
            <dt className="text-ink/80">{texts.market.priceChart.current}</dt>
            <dd className="font-semibold">{formatRub(row.current, { unit: '₽/т' })}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

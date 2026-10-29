// Линейный график по правилам раздела 8: линии 2 px, приглушённая сетка, подпись у линии,
// выделенная последняя точка, тултип, одна ось Y, цвет закреплён за сущностью (культурой).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  type TooltipContentProps,
} from 'recharts';
import { formatDate, formatNumber, parseIsoDate } from '../lib/format';
import type { DataPoint, Frequency } from '../types';
import { useTokenColors } from './theme';

export interface ChartSeries {
  id: string;
  /** Подпись у линии и в тултипе: «Пшеница» */
  label: string;
  /** CSS-переменная цвета сущности: '--crop-wheat' (CropConfig.colorVar) */
  colorVar: string;
  points: DataPoint[];
  /** Пунктир — для норм/прогнозов (например, «Норма за 5 лет»). Цвет — тот же или --muted */
  dashed?: boolean;
}

export interface LineChartProps {
  series: ChartSeries[];
  frequency?: Frequency;
  /** Формат значений оси и тултипа (единица — в ChartFrame.unit) */
  formatValue?: (v: number) => string;
  /** Формат даты в тултипе */
  formatTooltipDate?: (iso: string) => string;
  height?: number;
  /** Подписи по оси Y не с нуля — по умолчанию auto */
  yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
  ariaLabel?: string;
  /**
   * Ширина поля справа под подписи у линий, px (подписи длиннее сокращаются с «…»).
   * По умолчанию — по длине самой длинной подписи; на узком графике (< 480 px) подписи
   * автоматически уходят в легенду под графиком, и область построения занимает всю ширину.
   */
  labelWidth?: number;
}

const NARROW = 480;
const CHAR_PX = 7.4;
/** Подпись, умещённая в поле: «Подсолнечник» → «Подсол…» */
function fitLabel(label: string, room: number): string {
  const max = Math.max(3, Math.floor((room - 14) / CHAR_PX));
  return label.length <= max ? label : `${label.slice(0, max - 1)}…`;
}

// Даты — только через formatDate из src/lib/format.ts.

function tickDate(iso: string, f: Frequency): string {
  if (f === 'year') return formatDate(iso, 'year');
  if (f === 'month') {
    const d = parseIsoDate(iso);
    // Январь подписываем с годом, чтобы на оси читался переход года
    return d?.month === 1 ? `${formatDate(iso, 'monthShort')} ’${String(d.year).slice(2)}` : formatDate(iso, 'monthShort');
  }
  return formatDate(iso, 'dayMonth');
}
function tooltipDate(iso: string, f: Frequency): string {
  if (f === 'year') return formatDate(iso, 'year');
  if (f === 'month') {
    const s = formatDate(iso, 'month');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return formatDate(iso, 'long');
}

type Row = { date: string } & Record<string, number | null | string>;

export default function LineChart({
  series,
  frequency = 'month',
  formatValue = (v) => formatNumber(v),
  formatTooltipDate,
  height = 280,
  yDomain = ['auto', 'auto'],
  ariaLabel,
  labelWidth,
}: LineChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Тултип не залипает после тапа: гасим при уходе указателя и при касании вне графика
  const [tipOn, setTipOn] = useState(false);
  useEffect(() => {
    if (!tipOn) return;
    const off = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setTipOn(false);
    };
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [tipOn]);
  const colors = useTokenColors({
    ...Object.fromEntries(series.map((s) => [s.id, s.colorVar])),
    __grid: '--grid',
    __muted: '--muted',
    __surface: '--surface',
    __line: '--line-strong',
  } as Record<string, string>);

  const autoRoom = Math.round(Math.max(...series.map((x) => x.label.length), 4) * CHAR_PX + 18);
  // Узкий экран без явной ширины — подписи в легенду под графиком
  const legendMode = labelWidth === undefined && boxWidth !== null && boxWidth < NARROW;
  const labelRoom = legendMode ? 14 : (labelWidth ?? autoRoom);
  const { rows, lastIndex } = useMemo(() => {
    const byDate = new Map<string, Row>();
    for (const s of series) {
      for (const p of s.points) {
        const row = byDate.get(p.date) ?? ({ date: p.date } as Row);
        row[s.id] = p.value;
        byDate.set(p.date, row);
      }
    }
    const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    // Последняя непустая точка каждой серии
    const lastIndex: Record<string, number> = {};
    for (const s of series) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const v = rows[i][s.id];
        if (typeof v === 'number') {
          lastIndex[s.id] = i;
          break;
        }
      }
    }
    return { rows, lastIndex };
  }, [series]);

  const fmtTip = formatTooltipDate ?? ((d: string) => tooltipDate(d, frequency));
  const tickStyle = { fill: colors.__muted, fontSize: 12, fontFamily: '"Golos Text", system-ui, sans-serif' };

  return (
    <div
      ref={boxRef}
      className="num w-full"
      role="img"
      aria-label={ariaLabel}
      onPointerMove={() => !tipOn && setTipOn(true)}
      onPointerDown={() => setTipOn(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setTipOn(false)}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RLineChart data={rows} margin={{ top: 16, right: labelRoom, bottom: 4, left: 2 }}>
          <CartesianGrid vertical={false} stroke={colors.__grid} strokeWidth={1} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => tickDate(d, frequency)}
            tick={tickStyle}
            axisLine={{ stroke: colors.__line }}
            tickLine={false}
            minTickGap={18}
            tickMargin={8}
          />
          <YAxis
            tickFormatter={(v: number) => formatValue(v)}
            tick={tickStyle}
            axisLine={false}
            tickLine={false}
            width={60}
            domain={yDomain}
            tickCount={5}
          />
          <Tooltip
            cursor={{ stroke: colors.__line, strokeWidth: 1, strokeDasharray: '3 3' }}
            content={(p) => (
              <ChartTooltip {...p} series={series} colors={colors} formatValue={formatValue} formatDate={fmtTip} />
            )}
            isAnimationActive={false}
            {...(tipOn ? {} : { active: false })}
          />
          {series.map((s) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.label}
              stroke={colors[s.id]}
              strokeWidth={2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              connectNulls={false}
              isAnimationActive={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: colors.__surface, fill: colors[s.id] }}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const { cx, cy, index } = props;
                if (index !== lastIndex[s.id] || cx == null || cy == null) return <g key={`d-${s.id}-${index}`} />;
                return (
                  <g key={`last-${s.id}`}>
                    <circle cx={cx} cy={cy} r={7} fill={colors[s.id]} opacity={0.18} />
                    <circle cx={cx} cy={cy} r={4} fill={colors[s.id]} stroke={colors.__surface} strokeWidth={2} />
                  </g>
                );
              }}
            />
          ))}
          {!legendMode && (
          <LineEndLabels
            items={series
              .filter((x) => x.id in lastIndex)
              .map((x) => ({
                id: x.id,
                label: fitLabel(x.label, labelRoom),
                color: colors[x.id],
                date: rows[lastIndex[x.id]].date,
                value: rows[lastIndex[x.id]][x.id] as number,
              }))}
            halo={colors.__surface}
          />
          )}
        </RLineChart>
      </ResponsiveContainer>
      {legendMode && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5 px-2 pb-1 text-[13px]">
          {series
            .filter((x) => x.id in lastIndex)
            .map((x) => (
              <li key={x.id} className="flex min-w-0 items-center gap-1.5">
                <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 rounded-full" style={{ background: colors[x.id] }} />
                <span className="font-semibold" style={{ color: colors[x.id] }}>
                  {x.label}
                </span>
                <span className="text-muted">{formatValue(rows[lastIndex[x.id]][x.id] as number)}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  colors,
  formatValue,
  formatDate,
}: Pick<TooltipContentProps<number, string>, 'active' | 'label'> & {
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  series: ChartSeries[];
  colors: Record<string, string>;
  formatValue: (v: number) => string;
  formatDate: (iso: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="num min-w-[160px] rounded-control border border-line bg-surface px-3 py-2 text-sm shadow-pop">
      <p className="mb-1.5 text-xs text-muted">{formatDate(String(label))}</p>
      <ul className="space-y-1">
        {series.map((s) => {
          const item = payload.find((p) => p.dataKey === s.id);
          const v = item?.value;
          if (typeof v !== 'number') return null;
          return (
            <li key={s.id} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-ink/80">
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-3.5 rounded-full"
                  style={{ background: colors[s.id] }}
                />
                {s.label}
              </span>
              <span className="font-semibold text-ink">{formatValue(v)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Подписи у концов линий справа от последней точки; разводятся по вертикали, чтобы не слипались. */
function LineEndLabels({
  items,
  halo,
}: {
  items: Array<{ id: string; label: string; color: string; date: string; value: number }>;
  halo: string;
}) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const area = usePlotArea();
  if (!xScale || !yScale || !area) return null;
  const GAP = 16;
  const placed = items
    .map((it) => ({ ...it, x: Number(xScale(it.date)), y: Number(yScale(it.value)) }))
    .filter((it) => Number.isFinite(it.x) && Number.isFinite(it.y))
    .sort((a, b) => a.y - b.y)
    .map((it) => ({ ...it, ly: it.y }));
  for (let i = 1; i < placed.length; i++) placed[i].ly = Math.max(placed[i].ly, placed[i - 1].ly + GAP);
  const bottom = area.y + area.height;
  const overflow = placed.length ? placed[placed.length - 1].ly - bottom : 0;
  if (overflow > 0) for (const p of placed) p.ly -= overflow;
  for (let i = placed.length - 2; i >= 0; i--) placed[i].ly = Math.min(placed[i].ly, placed[i + 1].ly - GAP);
  return (
    <g className="recharts-line-end-labels" pointerEvents="none">
      {placed.map((p) => (
        <text
          key={p.id}
          x={p.x + 10}
          y={p.ly}
          dy="0.35em"
          textAnchor="start"
          fill={p.color}
          fontSize={12.5}
          fontWeight={600}
          fontFamily='"Golos Text", system-ui, sans-serif'
          paintOrder="stroke"
          stroke={halo}
          strokeWidth={4}
          strokeLinejoin="round"
        >
          {p.label}
        </text>
      ))}
    </g>
  );
}

// Горизонтальная диаграмма-«торнадо»: для каждого фактора — отрезок от худшего до лучшего значения
// вокруг базовой линии. Одна шкала на все строки. Без статусных цветов: «хуже» — штриховка, «лучше» — акцент.
// Подходит и для других «диапазонов вокруг базы» (например, разброс цены по месяцам).

export interface TornadoRow {
  id: string;
  label: string;
  /** Худшее значение (меньше базы) */
  low: number;
  /** Лучшее значение (больше базы) */
  high: number;
  /** Подписи условий у концов: «цена −30%», «солярка +30%» */
  lowCaption?: string;
  highCaption?: string;
  /** Подпись строки для чтения с экрана */
  ariaLabel?: string;
}

export interface TornadoChartProps {
  rows: TornadoRow[];
  base: number;
  /** Подпись базовой линии: «Сегодня: 22 млн ₽» */
  baseLabel?: string;
  format: (v: number) => string;
  /** Подписи легенды: «Хуже», «Лучше» */
  lowLegend: string;
  highLegend: string;
  className?: string;
}

const pct = (v: number, min: number, span: number) => ((v - min) / span) * 100;

export default function TornadoChart({ rows, base, baseLabel, format, lowLegend, highLegend, className = '' }: TornadoChartProps) {
  const values = rows.flatMap((r) => [r.low, r.high]).concat(base);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const basePct = pct(base, min, span);

  return (
    <div className={`w-full ${className}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="tornado-low inline-block h-3 w-5 rounded-tag" />
          {lowLegend}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-5 rounded-tag bg-accent" />
          {highLegend}
        </span>
        {baseLabel && (
          <span className="num inline-flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-0.5 bg-ink" />
            {baseLabel}
          </span>
        )}
      </div>

      <ul className="space-y-5">
        {rows.map((r) => {
          const lo = pct(r.low, min, span);
          const hi = pct(r.high, min, span);
          return (
            <li key={r.id} aria-label={r.ariaLabel}>
              <p className="mb-1.5 text-sm font-semibold text-ink">{r.label}</p>
              <div className="relative h-8 rounded-control bg-surface-2">
                <div
                  className="tornado-low absolute inset-y-1 rounded-l-[4px]"
                  style={{ left: `${lo}%`, width: `${Math.max(basePct - lo, 0)}%` }}
                />
                <div
                  className="absolute inset-y-1 rounded-r-[4px] bg-accent"
                  style={{ left: `${basePct}%`, width: `${Math.max(hi - basePct, 0)}%` }}
                />
                <div aria-hidden className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${basePct}%` }} />
              </div>
              <div className="num relative mt-1 h-9 text-xs" aria-hidden>
                {/* подписи расходятся от концов отрезка наружу; у краёв шкалы — внутрь, чтобы не вылезти */}
                <span
                  className={`absolute top-0 max-w-[48%] whitespace-nowrap ${lo > 35 ? '-translate-x-full text-right' : 'text-left'}`}
                  style={{ left: `${lo}%` }}
                >
                  <span className="block font-semibold text-ink">{format(r.low)}</span>
                  {r.lowCaption && <span className="block text-muted">{r.lowCaption}</span>}
                </span>
                <span
                  className={`absolute top-0 max-w-[48%] whitespace-nowrap ${hi < 65 ? 'text-left' : '-translate-x-full text-right'}`}
                  style={{ left: `${hi}%` }}
                >
                  <span className="block font-semibold text-ink">{format(r.high)}</span>
                  {r.highCaption && <span className="block text-muted">{r.highCaption}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

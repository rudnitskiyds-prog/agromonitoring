// Прогноз на 16 дней: столбик «минимум–максимум» на общей шкале °C и отдельный ряд осадков (мм).
// Разные величины — разные шкалы, без второй оси. Дни риска отмечены значком; подпись и статус — в списке рисков.
import { DropletOff, Snowflake, ThermometerSun } from 'lucide-react';
import { texts } from '../../content/texts';
import { formatDayRange } from '../../lib/signals';
import { formatNumber, formatWeekdayShort } from '../../lib/format';
import type { DailyWeather, WeatherRisk, WeatherRiskType } from '../../types';
import StatusTag, { STATUS_STYLE } from '../StatusTag';

const F = texts.harvest.forecast;
const U = texts.common.units;

export const RISK_ICON: Record<WeatherRiskType, typeof Snowflake> = {
  frost: Snowflake,
  heat: ThermometerSun,
  dry_spell: DropletOff,
};

const deg = (v: number) => `${formatNumber(v, 0)}°`;

function risksOn(date: string, risks: WeatherRisk[]): WeatherRisk[] {
  return risks.filter((r) => r.from <= date && date <= r.to);
}

export default function ForecastStrip({ days, risks }: { days: DailyWeather[]; risks: WeatherRisk[] }) {
  const lows = days.map((d) => d.tMin).filter((v): v is number => v !== null);
  const highs = days.map((d) => d.tMax).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(0, ...lows) - 1);
  const hi = Math.ceil(Math.max(...highs, lo + 10) + 1);
  const y = (t: number) => ((t - lo) / (hi - lo)) * 100;
  const maxRain = Math.max(5, ...days.map((d) => d.precipitation ?? 0));
  const zero = lo < 0 && hi > 0 ? y(0) : null;

  return (
    <div className="px-3 sm:px-3">
      <ol className="grid grid-cols-8 gap-x-1 gap-y-5 sm:[grid-template-columns:repeat(16,minmax(0,1fr))]" aria-label={F.title}>
        {days.map((d, i) => {
          const dayRisks = risksOn(d.date, risks);
          const worst = dayRisks.find((r) => r.status === 'worse') ?? dayRisks[0];
          const tone = worst ? STATUS_STYLE[worst.status] : null;
          const Icon = worst ? RISK_ICON[worst.type] : null;
          const dayNum = Number(d.date.slice(8, 10));
          const newMonth = i === 0 || dayNum === 1;
          const label = `${formatDayRange(d.date, d.date)}: ${F.tMin.toLowerCase()} ${d.tMin === null ? '—' : deg(d.tMin)}, ${F.tMax.toLowerCase()} ${
            d.tMax === null ? '—' : deg(d.tMax)
          }, ${F.rain.toLowerCase()} ${formatNumber(d.precipitation ?? 0, 1)} ${U.mm}${dayRisks.length ? `. ${dayRisks.map((r) => r.text).join('; ')}` : ''}`;
          return (
            <li
              key={d.date}
              aria-label={label}
              title={label}
              className={`num relative flex min-w-0 flex-col items-center rounded-control border px-0.5 pb-1.5 pt-1 ${
                tone ? `${tone.bg} ${tone.border}` : 'border-transparent'
              }`}
            >
              <span className="text-[11px] leading-4 text-muted">{formatWeekdayShort(d.date)}</span>
              <span className={`text-[13px] font-semibold leading-4 ${newMonth ? 'text-ink' : 'text-ink/80'}`}>{dayNum}</span>
              <span className="mt-0.5 h-4">{Icon && <Icon size={14} strokeWidth={2.25} className={tone?.text} aria-hidden />}</span>

              {/* температура: столбик от минимума до максимума на общей шкале */}
              <span className="text-[11px] font-semibold leading-4">{d.tMax === null ? '—' : deg(d.tMax)}</span>
              <div className="relative my-1 h-28 w-full" aria-hidden>
                {zero !== null && (
                  <div className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${zero}%` }} />
                )}
                {d.tMin !== null && d.tMax !== null && (
                  <div
                    className="absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-ink/70"
                    style={{
                      bottom: `${y(d.tMin)}%`,
                      height: `${Math.max(2, y(d.tMax) - y(d.tMin))}%`,
                    }}
                  />
                )}
              </div>
              <span className={`text-[11px] leading-4 ${d.tMin !== null && d.tMin <= 0 ? 'font-semibold text-ink' : 'text-muted'}`}>
                {d.tMin === null ? '—' : deg(d.tMin)}
              </span>

              {/* осадки: своя шкала, мм */}
              <div className="relative mt-2 h-8 w-full border-b border-line-strong" aria-hidden>
                {(d.precipitation ?? 0) > 0 && (
                  <div
                    className="absolute bottom-0 left-1/2 w-3 -translate-x-1/2 rounded-t-[2px] bg-accent/70"
                    style={{ height: `${Math.max(6, ((d.precipitation ?? 0) / maxRain) * 100)}%` }}
                  />
                )}
              </div>
              <span className="mt-0.5 text-[10.5px] leading-4 text-muted">
                {(d.precipitation ?? 0) >= 0.1 ? formatNumber(d.precipitation ?? 0, (d.precipitation ?? 0) < 10 ? 1 : 0) : '·'}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs text-muted" aria-hidden>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-1.5 rounded-full bg-ink/70" />
          {F.tMin} – {F.tMax}, {U.celsius}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-3 rounded-t-[2px] bg-accent/70" />
          {F.rain}, {U.mm}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block w-4 border-t border-dashed border-line-strong" />0 {U.celsius}
        </span>
      </div>
    </div>
  );
}

/** Список рисков: значок + подпись + статус. Заморозок в октябре–марте — «норма», не красный. */
export function RiskList({ risks }: { risks: WeatherRisk[] }) {
  if (!risks.length) return <p className="text-[15px] text-ink/80">{F.noRisks}</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {risks.map((r) => {
        const Icon = RISK_ICON[r.type];
        const s = STATUS_STYLE[r.status];
        return (
          <li key={`${r.type}-${r.from}`} className="flex items-start gap-3 py-3">
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-control ${s.bg}`}>
              <Icon size={17} strokeWidth={2} className={s.text} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{F.risk[r.type]}</span>
                <StatusTag status={r.status} size="sm" />
              </p>
              <p className="num mt-0.5 text-sm text-ink/85">{r.text}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{F.riskHint[r.type]}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

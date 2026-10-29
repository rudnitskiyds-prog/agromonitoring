// Шаг «Фактор» для урожайности: реальная погода сезона (ERA5, помесячно) против нормы.
// Расчёт норм, отклонений и неполного месяца — src/lib/climate.ts; здесь только вывод.
import { CloudRain, Thermometer } from 'lucide-react';
import { texts } from '../../content/texts';
import { criticalWindow, dataCutoff, growingWindow, mainWeatherCause, monthRows, normYearsOf } from '../../lib/climate';
import { sourceOf } from '../../lib/data';
import { MONTHS_NOM, formatDate, formatNumber, formatPct } from '../../lib/format';
import type { CropId, DataSeries, RegionId, SignalStatus } from '../../types';
import SourceNote from '../SourceNote';
import StatusTag from '../StatusTag';

const FC = texts.why.factorCause;
const T_SW = texts.why.seasonWeather;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface MonthRow {
  key: string;
  month: number;
  name: string;
  mm: number;
  normMm: number;
  devPct: number | null;
  tDiff: number | null;
  incomplete: boolean;
}

export interface SeasonWeatherProps {
  region: RegionId;
  crop: CropId;
  year: number;
  precipitation: DataSeries;
  temperature: DataSeries;
}

export default function SeasonWeather({ region, crop, year, precipitation, temperature }: SeasonWeatherProps) {
  const window = growingWindow(region, crop, year);
  const normRange = normYearsOf(precipitation);
  const rain = monthRows(precipitation, window, normRange);
  const temp = monthRows(temperature, window, normYearsOf(temperature));
  const cutoff = dataCutoff(precipitation) ?? precipitation.updated_at;

  const rows: MonthRow[] = rain
    .map((r, i): MonthRow | null =>
      r.value === null
        ? null
        : {
            key: r.date.slice(0, 7),
            month: r.month,
            name: cap(MONTHS_NOM[r.month - 1]) + (window[i].year !== year ? ` ${window[i].year}` : ''),
            mm: r.value,
            normMm: r.norm ?? 0,
            devPct: r.deviationPct,
            tDiff: temp[i]?.diff ?? null,
            incomplete: r.incomplete,
          },
    )
    .filter((r): r is MonthRow => r !== null);

  if (!rows.length) return <p className="text-[15px] text-ink/80">{FC.noWeather}</p>;

  // Главная причина — только по критическим месяцам культуры (налив и уборка), правило — в lib/climate
  const critical = criticalWindow(region, crop, year);
  const criticalKeys = new Set(critical.map((c) => `${c.year}-${String(c.month).padStart(2, '0')}`));
  const cause = mainWeatherCause(rain, critical);
  const main = cause ? rows.find((r) => r.key === cause.date.slice(0, 7)) : undefined;
  const causeText = cause
    ? (cause.kind === 'dry' ? FC.mainDry : FC.mainWet)(
        MONTHS_NOM[cause.month - 1],
        formatPct(Math.abs(cause.deviationPct), { sign: false, fractionDigits: 0 }),
      )
    : FC.noMainCause;
  const scale = Math.max(...rows.map((r) => Math.max(r.mm, r.normMm)), 1);
  const statusOf = (r: MonthRow): { status: SignalStatus | null; label: string } => {
    if (r.incomplete || r.devPct === null) return { status: null, label: T_SW.incomplete };
    if (r.devPct <= -20) return { status: 'worse', label: T_SW.drier };
    if (r.devPct >= 20) return { status: null, label: T_SW.wetter };
    return { status: 'normal', label: T_SW.near };
  };
  const mmStr = (v: number) => formatNumber(v, 0);
  const sentence = (r: MonthRow): string => {
    const name = cap(MONTHS_NOM[r.month - 1]);
    if (r.incomplete) return FC.monthIncomplete(name, formatDate(cutoff, 'dayMonth'));
    const pct = formatPct(Math.abs(r.devPct ?? 0), { sign: false, fractionDigits: 0 });
    return (r.devPct ?? 0) < 0
      ? FC.rainMonthBelow(name, mmStr(r.mm), mmStr(r.normMm), pct)
      : FC.rainMonthAbove(name, mmStr(r.mm), mmStr(r.normMm), pct);
  };
  // Фразы — по месяцам с заметным отклонением (от 10%) и по неполному месяцу
  const notable = rows.filter((r) => r.incomplete || Math.abs(r.devPct ?? 0) >= 10);

  return (
    <div>
      {main ? (
        <div className="relative overflow-hidden rounded-card border border-status-worse/40 bg-status-worse-bg/60 px-4 py-4 sm:px-5">
          <StatusTag status="worse" label={cause?.kind === 'wet' ? T_SW.mainCauseWet : T_SW.mainCauseDry} />
          <p className="mt-2.5 text-[17px] font-semibold leading-snug text-ink sm:text-lg">{sentence(main)}</p>
          <p className="mt-1.5 max-w-prose text-[15px] leading-snug text-ink/80">{causeText}</p>
        </div>
      ) : (
        <p className="rounded-card border border-line bg-bg/60 px-4 py-3 text-[15px] text-ink/80">{causeText}</p>
      )}

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <CloudRain size={16} className="text-accent" aria-hidden />
          {T_SW.rainCol}, {texts.common.units.mm}
        </p>
        {normRange.to >= normRange.from && (
          <p className="text-xs text-muted">{T_SW.normBasis(String(normRange.from), String(normRange.to))}</p>
        )}
      </div>
      <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className="inline-block h-3 w-3 shrink-0 border-l-2 border-l-ochre bg-ochre-soft/60" />
        {T_SW.criticalLegend}
      </p>

      <ol className="num mt-2 divide-y divide-line border-y border-line">
        {rows.map((r) => {
          const st = statusOf(r);
          const isMain = main?.key === r.key;
          const isCritical = criticalKeys.has(r.key);
          return (
            <li
              key={r.key}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)_150px_170px] ${
                isMain ? 'bg-status-worse-bg/35' : isCritical ? 'bg-ochre-soft/30' : ''
              } ${isCritical ? 'border-l-2 border-l-ochre' : 'border-l-2 border-l-transparent'}`}
            >
              <span className={`text-[14px] ${isMain ? 'font-semibold' : 'font-medium'} text-ink sm:pl-2`}>{r.name}</span>
              {/* бар: факт и метка нормы */}
              <span className="relative col-span-2 row-start-2 block h-3 sm:col-span-1 sm:row-start-auto" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-[2px] bg-surface-2" style={{ width: '100%' }} />
                <span
                  className={`absolute inset-y-0 left-0 rounded-[2px] ${r.incomplete ? 'bg-accent/35' : 'bg-accent/80'}`}
                  style={{ width: `${(r.mm / scale) * 100}%` }}
                />
                <span
                  className="absolute -inset-y-1 w-0 border-l-2 border-dashed border-ink/60"
                  style={{ left: `${(r.normMm / scale) * 100}%` }}
                  title={`${T_SW.norm} ${mmStr(r.normMm)}`}
                />
              </span>
              <span className="col-span-2 row-start-3 text-[13px] text-ink/80 sm:col-span-1 sm:row-start-auto">
                <span className="font-semibold text-ink">{mmStr(r.mm)}</span> / {T_SW.norm} {mmStr(r.normMm)}
                {r.devPct !== null && (
                  <span className="ml-1.5 font-semibold text-ink">{formatPct(r.devPct, { fractionDigits: 0 })}</span>
                )}
              </span>
              <span className="col-start-2 row-start-1 flex justify-end sm:col-start-auto sm:row-start-auto sm:justify-start">
                {st.status ? (
                  <StatusTag status={st.status} label={st.label} size="sm" />
                ) : (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold text-muted">
                    <CloudRain size={12} aria-hidden />
                    {st.label}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <ul className="mt-4 space-y-1.5 text-[15px] leading-snug text-ink/85">
        {notable.map((r) => (
          <li key={r.key} className="flex gap-2">
            <span aria-hidden className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-ink/50" />
            <span>{sentence(r)}</span>
          </li>
        ))}
      </ul>

      {rows.some((r) => r.tDiff !== null) && (
        <div className="mt-5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Thermometer size={16} className="text-accent" aria-hidden />
            {T_SW.tempCol}, {texts.common.units.celsius}
          </p>
          <ul className="num mt-2 flex flex-wrap gap-2">
            {rows.map((r) => (
              <li key={r.key} className="rounded-tag border border-line bg-surface px-2 py-1 text-[13px]">
                <span className="text-muted">{formatDate(`${r.key}-01`, 'monthShort')}</span>{' '}
                <span className="font-semibold">
                  {r.tDiff === null ? '—' : `${r.tDiff >= 0.05 ? '+' : ''}${formatNumber(r.tDiff, 1)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SourceNote source={[sourceOf(precipitation), sourceOf(temperature)]} className="mt-4 border-t border-line pt-3" />
    </div>
  );
}

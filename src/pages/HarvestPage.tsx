// «Урожай и погода» — «Чего ждать от урожая?».
// Урожайность по годам рядом с осадками и температурой сезона (реальные помесячные ряды ERA5) — ряд малых
// графиков с общей шкалой лет, без второй оси; осадки сезона по месяцам против нормы; прогноз на 16 дней с рисками.
// Сценарий С3 приходит сюда с ?region=saratov&crop=sunflower.
import { ArrowRight, CloudOff, Radio } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Button from '../components/Button';
import ChartFrame from '../components/ChartFrame';
import ForecastStrip, { RiskList } from '../components/harvest/ForecastStrip';
import RainLedger from '../components/harvest/RainLedger';
import YearMiniChart from '../components/harvest/YearMiniChart';
import { ErrorState, LoadingState, Skeleton } from '../components/States';
import PagePicker from '../components/market/PagePicker';
import { useSelection } from '../components/market/useSelection';
import { useFarmProfile } from '../components/useFarmProfile';
import { CROPS, REGIONS } from '../config/regions';
import { texts } from '../content/texts';
import { useForecast, useSeriesList } from '../hooks/useData';
import { sourceOf } from '../lib/data';
import { formatDate, formatNumber, formatPct } from '../lib/format';
import { detectWeatherRisks } from '../lib/signals';
import { criticalWindow, mainWeatherCause, normOfYears, normYearsOf, seasonByYear, seasonMonthRows } from '../lib/climate';
import { changePct, validPoints } from '../lib/series';
import { harvestLink, whyLink } from '../routes';
import type { CropId, DataSeries, RegionId, SeriesKey } from '../types';

const H = texts.harvest;
const Y = H.yieldChart;
const C = texts.common;
const L_NO_YIELD_YET = (from: number, to: number) => Y.noOfficial(from === to ? String(from) : `${from}–${to}`);

export default function HarvestPage() {
  const { profile } = useFarmProfile();
  const { region, crop } = useSelection(profile);
  const regionCfg = REGIONS[region];

  // Блоки независимы: история (урожай + погода ERA5) и прогноз. Повтор — перемонтирование по ключу.
  const [retry, setRetry] = useState({ history: 0, forecast: 0 });
  const bump = (k: keyof typeof retry) => () => setRetry((r) => ({ ...r, [k]: r[k] + 1 }));
  // Год последнего итога урожайности — для ссылки «Разобрать причины» (С3: 2023 → 2024)
  const [yieldYear, setYieldYear] = useState<number | null>(null);

  return (
    <main className="mx-auto max-w-page px-4 pb-section-lg pt-page-top sm:px-6 sm:pt-page-top-lg lg:px-8">
      <header>
        <p className="kicker">
          {C.nav.harvest} · {regionCfg.name}
        </p>
        <h1 className="mt-stack text-[28px] font-semibold leading-[1.12] sm:text-[38px]">{H.title}</h1>
        <PagePicker
          className="mt-block"
          region={region}
          crop={crop}
          profileCrops={region === profile.region ? profile.crops.map((c) => c.crop) : []}
          link={(p) => harvestLink(p)}
        />
      </header>

      <HistoryArea key={`h-${region}-${crop}-${retry.history}`} region={region} crop={crop} onRetry={bump('history')} onYieldYear={setYieldYear} />

      <ForecastBlock key={`f-${region}-${retry.forecast}`} region={region} onRetry={bump('forecast')} />

      <SummaryBlock crop={crop} region={region} yieldYear={yieldYear} />
    </main>
  );
}

// ── Урожай и погода сезона по годам ─────────────────────────────────────────
function HistoryArea({
  region,
  crop,
  onRetry,
  onYieldYear,
}: {
  region: RegionId;
  crop: CropId;
  onRetry: () => void;
  onYieldYear: (y: number | null) => void;
}) {
  const keys: SeriesKey[] = [
    { indicator: 'yield', region, crop, frequency: 'year' },
    { indicator: 'precipitation', region, frequency: 'month' },
    { indicator: 'temperature_mean', region, frequency: 'month' },
    { indicator: 'active_temp_sum', region, frequency: 'month' },
  ];
  const data = useSeriesList(keys);
  if (data.status === 'loading')
    return (
      <div className="mt-block grid gap-block">
        <LoadingState label={C.loading.chart}>
          <div className="grid gap-block sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={200} />
            ))}
          </div>
        </LoadingState>
        <LoadingState label={C.loading.chart}>
          <Skeleton height={260} />
        </LoadingState>
      </div>
    );
  if (data.status === 'error')
    return <ErrorState className="mt-block" message={C.errors.loadSeries(Y.title)} onRetry={onRetry} />;
  return (
    <HistoryBlocks
      crop={crop}
      region={region}
      yieldS={data.data[0]}
      rain={data.data[1]}
      temp={data.data[2]}
      active={data.data[3]}
      onYieldYear={onYieldYear}
    />
  );
}

function HistoryBlocks({
  crop,
  region,
  yieldS,
  rain,
  temp,
  active,
  onYieldYear,
}: {
  crop: CropId;
  region: RegionId;
  yieldS: DataSeries;
  rain: DataSeries;
  temp: DataSeries;
  active: DataSeries;
  onYieldYear: (y: number | null) => void;
}) {
  const cropCfg = CROPS[crop];
  const model = useMemo(() => {
    const yPts = validPoints(yieldS.series);
    const rainY = seasonByYear(rain, 'sum');
    const tempY = seasonByYear(temp, 'mean');
    const activeY = seasonByYear(active, 'sum');
    const allYears = [...yPts, ...rainY.filter((p) => p.value !== null)].map((p) => Number(p.date.slice(0, 4)));
    const first = Math.min(...allYears);
    const lastYear = Math.max(...allYears);
    const years = Array.from({ length: lastYear - first + 1 }, (_, i) => first + i);
    const range = normYearsOf(rain);
    const lastY = yPts[yPts.length - 1];
    // Год последнего итога урожайности (Росстат, сейчас 2024): для него — осадки по месяцам и главная причина.
    const yieldYear = lastY ? Number(lastY.date.slice(0, 4)) : null;
    const yieldRows = yieldYear !== null ? seasonMonthRows(rain, yieldYear, undefined, range) : [];
    // Критическое окно: месяц перед уборкой и уборка — по календарю культуры в регионе
    const yieldCritical = yieldYear !== null ? criticalWindow(region, crop, yieldYear) : [];
    // Текущий сезон: осадки по месяцам без вывода — итогов урожая ещё нет
    const currentRows = seasonMonthRows(rain, lastYear, undefined, range);
    const currentCritical = criticalWindow(region, crop, lastYear);
    const prevY = yPts[yPts.length - 2];
    const yoy = lastY && prevY ? changePct(yieldS, prevY.date, lastY.date) : null;
    const best = [...yPts].sort((a, b) => b.value - a.value)[0];
    const worst = [...yPts].sort((a, b) => a.value - b.value)[0];
    return {
      years,
      range,
      lastYear,
      yPts,
      rainY,
      tempY,
      activeY,
      yoy,
      prevYear: prevY?.date.slice(0, 4),
      lastYieldYear: lastY?.date.slice(0, 4),
      best,
      worst,
      norms: {
        yield: normOfYears(yPts, range),
        rain: normOfYears(rainY, range),
        temp: normOfYears(tempY, range),
        active: normOfYears(activeY, range),
      },
      yieldYear,
      yieldRows,
      yieldCritical,
      cause: yieldYear !== null ? mainWeatherCause(yieldRows, yieldCritical) : null,
      currentRows,
      currentCritical,
    };
  }, [yieldS, rain, temp, active, region, crop]);

  useEffect(() => onYieldYear(model.yieldYear), [model.yieldYear, onYieldYear]);
  const { range } = model;
  const norm = Y.normRange(String(range.from), String(range.to));
  const weatherSrc = sourceOf(rain);

  return (
    <>
      <ChartFrame
        className="mt-block"
        as="h2"
        question={Y.title}
        lead={
          <>
            {Y.lead} {Y.season}.{' '}
            {model.best && model.worst && (
              <span className="text-muted">
                {Y.bestYear(model.best.date.slice(0, 4))}. {Y.worstYear(model.worst.date.slice(0, 4))}.
              </span>
            )}
          </>
        }
        source={[sourceOf(yieldS), weatherSrc]}
        sourceNote={model.yieldYear !== null && model.yieldYear < model.lastYear ? L_NO_YIELD_YET(model.yieldYear + 1, model.lastYear) : undefined}
      >
        <div className="grid gap-x-4 gap-y-6 px-2 pb-2 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          <YearMiniChart
            title={`${Y.yieldLabel}: ${cropCfg.name.toLowerCase()}`}
            unit={Y.yAxis}
            points={model.yPts}
            years={model.years}
            kind="line"
            colorVar={cropCfg.colorVar}
            norm={model.norms.yield}
            normLabel={Y.avgRange(String(range.from), String(Math.min(range.to, model.yieldYear ?? range.to)))}
            formatValue={(v) => formatNumber(v, 1)}
            note={model.yoy != null && model.prevYear ? Y.vsPrev(model.prevYear, formatPct(model.yoy, { fractionDigits: 0 })) : undefined}
          />
          <YearMiniChart
            title={Y.rainLabel}
            unit={C.units.mm}
            points={model.rainY}
            years={model.years}
            kind="bar"
            colorVar="--accent"
            norm={model.norms.rain}
            normLabel={norm}
            formatValue={(v) => formatNumber(v, 0)}
          />
          <YearMiniChart
            title={Y.tempLabel}
            unit={C.units.celsius}
            points={model.tempY}
            years={model.years}
            kind="line"
            colorVar="--ink"
            norm={model.norms.temp}
            normLabel={norm}
            formatValue={(v) => formatNumber(v, 1)}
          />
          <YearMiniChart
            title={Y.activeSumLabel}
            unit={C.units.celsius}
            points={model.activeY}
            years={model.years}
            kind="bar"
            colorVar="--ink"
            norm={model.norms.active}
            normLabel={norm}
            formatValue={(v) => formatNumber(v, 0)}
          />
        </div>
      </ChartFrame>

      {model.yieldYear !== null && model.yieldYear < model.lastYear && (
        <div className="mt-block">
          <RainLedger
            rows={model.yieldRows}
            year={model.yieldYear}
            range={range}
            dataTo={rain.updated_at}
            source={weatherSrc}
            critical={model.yieldCritical}
            cause={model.cause}
          />
        </div>
      )}
      <div className="mt-block">
        <RainLedger
          rows={model.currentRows}
          year={model.lastYear}
          range={range}
          dataTo={rain.updated_at}
          source={weatherSrc}
          critical={model.currentCritical}
          cause={model.yieldYear === model.lastYear ? model.cause : undefined}
        />
      </div>
    </>
  );
}

// ── Прогноз на 16 дней ──────────────────────────────────────────────────────
function ForecastBlock({ region, onRetry }: { region: RegionId; onRetry: () => void }) {
  const cfg = REGIONS[region];
  const fc = useForecast(cfg ?? null);
  const F = H.forecast;
  const risks = useMemo(() => (fc.status === 'ready' ? detectWeatherRisks(fc.data.data) : []), [fc]);

  if (fc.status === 'loading')
    return (
      <LoadingState className="mt-block" label={C.loading.default}>
        <Skeleton height={36} width="50%" />
        <Skeleton height={220} />
      </LoadingState>
    );
  if (fc.status === 'error')
    return (
      <ErrorState className="mt-block" message={C.errors.loadSeries(F.title)} onRetry={onRetry} />
    );

  const { data: days, origin, source } = fc.data;
  const live = origin === 'live';
  return (
    <ChartFrame
      className="mt-block"
      as="h2"
      question={F.title}
      lead={`${F.lead} ${cfg.shortName}.`}
      actions={
        <span
          className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-tag border px-2 text-xs font-medium ${
            live ? 'border-accent/40 text-accent' : 'border-dashed border-line-strong text-muted'
          }`}
        >
          {live ? <Radio size={13} aria-hidden /> : <CloudOff size={13} aria-hidden />}
          {live ? H.live.liveBadge : H.live.cacheBadge}
        </span>
      }
      source={source}
    >
      {!live && (
        <div role="status" className="mx-3 mb-3 mt-2 rounded-control border border-dashed border-line-strong bg-surface-2/60 px-3 py-2 text-sm">
          <p className="font-medium">{C.weather.cacheNotice(formatDate(source.updated_at, 'long'))}</p>
          <p className="text-muted">{C.weather.cacheHint}</p>
        </div>
      )}
      <div className="pt-3">
        <ForecastStrip days={days} risks={risks} />
      </div>
      <div className="mx-3 mt-5 grid gap-5 border-t border-line pb-3 pt-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-10">
        <div>
          <h3 className="text-base font-semibold">{F.risksTitle}</h3>
          <p className="mt-0.5 text-sm text-muted">{F.risksLead}</p>
          <div className="mt-2">
            <RiskList risks={risks} />
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted lg:pt-8">{F.seasonRuleNote}</p>
      </div>
    </ChartFrame>
  );
}

// ── Вывод ───────────────────────────────────────────────────────────────────
function SummaryBlock({ crop, region, yieldYear }: { crop: CropId; region: RegionId; yieldYear: number | null }) {
  const S = H.summary;
  const year = yieldYear ?? new Date().getFullYear();
  return (
    <section
      aria-labelledby="harvest-summary"
      className="mt-block grid gap-4 rounded-sheet border border-accent/25 bg-accent-soft/60 p-card sm:p-card-lg lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-block-lg"
    >
      <div>
        <h2 id="harvest-summary" className="text-xl leading-tight sm:text-[22px]">
          {S.title}
        </h2>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink/85">{S.dryHint}</p>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink/85">{S.weatherToRub}</p>
      </div>
      <Button
        to={whyLink({ crop, region, from: year - 1, to: year })}
        wrap
        className="w-full sm:w-auto"
        iconRight={<ArrowRight size={17} aria-hidden />}
      >
        {S.toWhy}
      </Button>
    </section>
  );
}

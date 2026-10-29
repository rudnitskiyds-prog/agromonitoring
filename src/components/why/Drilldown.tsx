// Drill-down «показатель → динамика → регион → фактор» для выбранного столбца водопада.
// Шаг и фактор живут в query (?factor=&step=), поэтому кнопка «назад» браузера работает.
import { ArrowLeft, ArrowRight, Check, CloudSunRain, ExternalLink, Fuel, RotateCcw, Sprout, Wheat } from 'lucide-react';
import { useMemo } from 'react';
import { CROPS, REGIONS } from '../../config/regions';
import { texts } from '../../content/texts';
import { sourceOf } from '../../lib/data';
import { formatNumber, formatPct, formatRub } from '../../lib/format';
import { changePct, validPoints } from '../../lib/series';
import { ROUTES, harvestLink, marketLink, whatIfLink } from '../../routes';
import type { CropId, DataSeries, FactorAnalysis, FactorId, GeoScope, Frequency, RegionId, SeriesKey, SignalStatus } from '../../types';
import Button from '../Button';
import { LoadingState, Skeleton } from '../States';
import WithSeries from './WithSeries';
import ChartFrame from '../ChartFrame';
import LineChart, { type ChartSeries } from '../LineChart';
import StatusTag from '../StatusTag';
import { DRILL_STEPS, compareScopes, seasonDate, type DrillStep } from './model';
import SeasonWeather from './SeasonWeather';
import { FACTOR_NAME, formatMoney, statusOfEffect } from './Waterfall';

const W = texts.why;
const D = W.drilldown;
const RC = W.regionCompare;
const FT = texts.factors;

const DX = W.drilldownExtra;

const FACTOR_ICON: Record<FactorId, typeof Wheat> = { price: Wheat, yield: Sprout, diesel: Fuel, otherCosts: Sprout };

function stepsFor(f: FactorId): DrillStep[] {
  return f === 'otherCosts' ? ['indicator', 'factor'] : DRILL_STEPS;
}

const stepQuestion: Record<DrillStep, string> = {
  indicator: D.indicatorQuestion,
  dynamics: D.dynamicsQuestion,
  region: D.regionQuestion,
  factor: D.factorQuestion,
};

/** Показатель фактора: ряд, частота, единица, формат. */
interface IndicatorSpec {
  key: (scope: GeoScope) => SeriesKey;
  frequency: Frequency;
  unit: string;
  fmt: (v: number) => string;
  axisFmt: (v: number) => string;
  /** Рост показателя хорош (+1) или плох (−1) для прибыли */
  good: 1 | -1;
  /** Сколько последних точек показывать на графике */
  window: number;
}

function specFor(f: FactorId, crop: CropId): IndicatorSpec | null {
  const U = texts.common.units;
  if (f === 'yield')
    return {
      key: (region) => ({ indicator: 'yield', region, crop, frequency: 'year' }),
      frequency: 'year',
      unit: U.chaPerHa,
      fmt: (v) => `${formatNumber(v, 1)} ${U.chaPerHa}`,
      axisFmt: (v) => formatNumber(v, 1),
      good: 1,
      window: 12,
    };
  if (f === 'price')
    return {
      key: (region) => ({ indicator: 'producer_price', region, crop, frequency: 'month' }),
      frequency: 'month',
      unit: U.rubPerT,
      fmt: (v) => formatRub(v, { unit: '₽/т' }),
      axisFmt: (v) => formatNumber(v),
      good: 1,
      window: 36,
    };
  if (f === 'diesel')
    return {
      key: (region) => ({ indicator: 'diesel_price', region, frequency: 'week' }),
      frequency: 'week',
      unit: U.rubPerL,
      fmt: (v) => `${formatNumber(v, 2)} ${U.rubPerL}`,
      axisFmt: (v) => formatNumber(v, 0),
      good: -1,
      window: 104,
    };
  return null;
}

const scopeName = (s: GeoScope) => (s === 'russia' ? RC.russia : (REGIONS[s]?.name ?? s));
const scopeShort = (s: GeoScope) => (s === 'russia' ? RC.russia : (REGIONS[s]?.shortName ?? s));

function seriesColor(f: FactorId, crop: CropId, own: boolean): string {
  if (!own) return '--series-other';
  return f === 'diesel' ? '--series-diesel' : CROPS[crop].colorVar;
}

/** Точки ряда до даты сезона «to» включительно, последние `window` штук. */
function windowed(s: DataSeries, toDate: string, window: number) {
  const pts = validPoints(s.series).filter((p) => p.date <= toDate);
  return pts.slice(-window);
}

export interface DrilldownProps {
  region: RegionId;
  crop: CropId;
  factor: FactorId;
  step: DrillStep;
  analysis: FactorAnalysis;
  from: number;
  to: number;
  onStep: (step: DrillStep) => void;
  /** true — регион и план из профиля хозяйства: можно говорить «вы»; иначе это разбор выбранного региона */
  own: boolean;
}

export default function Drilldown({ region, crop, factor, step, analysis, from, to, onStep, own }: DrilldownProps) {
  const steps = stepsFor(factor);
  const current = steps.includes(step) ? step : steps[0];
  const idx = steps.indexOf(current);
  const Icon = FACTOR_ICON[factor];
  const contribution = analysis.contributions.find((c) => c.factor === factor);
  const spec = specFor(factor, crop);

  const scopes = useMemo(() => (factor === 'otherCosts' ? [] : [region, ...compareScopes(region, factor)]), [region, factor]);
  const keys = spec ? scopes.map((s) => spec.key(s)) : [];
  const chartLoading = (
    <LoadingState label={texts.common.loading.chart} framed={false}>
      <Skeleton height={300} className="rounded-card" />
    </LoadingState>
  );

  return (
    <section id="why-drilldown" tabIndex={-1} aria-labelledby="why-drilldown-title" className="scroll-mt-6 focus:outline-none">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-control bg-accent-soft text-accent">
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="kicker">{D.title}</p>
          <h2 id="why-drilldown-title" className="mt-0.5 text-xl leading-tight sm:text-[22px]">
            {FACTOR_NAME[factor]}
          </h2>
        </div>
      </div>

      {/* Хлебные крошки: путь анализа */}
      <nav aria-label={D.breadcrumbLabel} className="mt-block">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
          {steps.map((s, i) => {
            const on = s === current;
            const done = i < idx;
            return (
              <li key={s} className="flex items-center gap-1.5">
                {i > 0 && (
                  <span aria-hidden className="text-muted">
                    {D.breadcrumbSeparator}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onStep(s)}
                  aria-current={on ? 'step' : undefined}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-tag border px-2.5 font-medium transition-colors ${
                    on
                      ? 'border-accent bg-accent text-accent-ink'
                      : done
                        ? 'border-line-strong bg-surface text-ink hover:border-accent'
                        : 'border-dashed border-line-strong text-muted hover:border-accent hover:text-ink'
                  }`}
                >
                  {done ? (
                    <Check size={13} strokeWidth={2.5} aria-hidden />
                  ) : (
                    <span className="num text-[11px] opacity-80">{i + 1}</span>
                  )}
                  {D.steps[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-block rounded-sheet border border-line bg-surface p-card-sm sm:p-card-lg">
        <h3 className="text-lg leading-snug">{stepQuestion[current]}</h3>
        <div className="mt-stack">
          {current === 'indicator' && contribution && (
            <IndicatorStep factor={factor} analysis={analysis} spec={spec} />
          )}
          {current === 'dynamics' && spec && (
            <WithSeries keys={keys} loading={chartLoading} errorMessage={texts.common.errors.chartFailed}>
              {(data) => (
                <SeriesStep
                  mode="dynamics"
                  factor={factor}
                  crop={crop}
                  region={region}
                  scopes={scopes}
                  data={data}
                  spec={spec}
                  from={from}
                  to={to}
                  own={own}
                />
              )}
            </WithSeries>
          )}
          {current === 'region' && spec && (
            <WithSeries keys={keys} loading={chartLoading} errorMessage={texts.common.errors.chartFailed}>
              {(data) => (
                <SeriesStep
                  mode="region"
                  factor={factor}
                  crop={crop}
                  region={region}
                  scopes={scopes}
                  data={data}
                  spec={spec}
                  from={from}
                  to={to}
                  own={own}
                />
              )}
            </WithSeries>
          )}
          {current === 'dynamics' && !spec && <p className="text-[15px] text-ink/80">{DX.otherCostsNoDynamics}</p>}
          {current === 'factor' && (
            <FactorStep factor={factor} crop={crop} region={region} to={to} />
          )}
        </div>

        <div className="mt-block flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-stack">
          {idx > 0 && (
            <Button variant="secondary" size="sm" iconLeft={<ArrowLeft size={15} aria-hidden />} onClick={() => onStep(steps[idx - 1])}>
              {D.back}
            </Button>
          )}
          {idx < steps.length - 1 ? (
            <Button size="sm" wrap iconRight={<ArrowRight size={15} aria-hidden />} onClick={() => onStep(steps[idx + 1])}>
              {DX.nextStep(stepQuestion[steps[idx + 1]])}
            </Button>
          ) : (
            <Button variant="text" size="sm" iconLeft={<RotateCcw size={14} aria-hidden />} onClick={() => onStep(steps[0])}>
              {D.restart}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Шаг 1: показатель ───────────────────────────────────────────────────────
function IndicatorStep({ factor, analysis, spec }: { factor: FactorId; analysis: FactorAnalysis; spec: IndicatorSpec | null }) {
  const c = analysis.contributions.find((x) => x.factor === factor)!;
  const fmt = spec?.fmt ?? ((v: number) => formatRub(v, { unit: '₽/га' }));
  const status: SignalStatus = statusOfEffect(c.effectPerHa);
  return (
    <div className="grid gap-block lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-block-lg">
      <div>
        <p className="max-w-prose text-[15px] leading-relaxed text-ink/80">
          {factor === 'otherCosts' ? W.waterfall.otherCostsHint : `${FT[factor].short} ${FT[factor].effectHint}`}
        </p>
        <dl className="num mt-stack grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">
              {DX.from} · {analysis.base.label}
            </dt>
            <dd className="mt-1 whitespace-nowrap text-[17px] font-semibold">{fmt(c.from)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">
              {DX.to} · {analysis.current.label}
            </dt>
            <dd className="mt-1 whitespace-nowrap text-[17px] font-semibold">{fmt(c.to)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{DX.change}</dt>
            <dd className="mt-1 whitespace-nowrap text-[17px] font-semibold">{c.changePct === null ? '—' : formatPct(c.changePct)}</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-card border border-line bg-bg/60 p-card-sm sm:p-card">
        <p className="text-xs text-muted">{DX.effect}</p>
        <p className="num-display mt-1.5 text-[30px] font-semibold leading-none sm:text-[34px]">
          {formatMoney(c.effectPerHa, 'perHa', true)}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-ink/80">
          <StatusTag status={status} size="sm" />
          <span className="num">{FT.effect.total(formatMoney(c.effectTotal, 'farm', true))}</span>
        </div>
      </div>
    </div>
  );
}

// ── Шаги 2 и 3: динамика и сравнение регионов ──────────────────────────────
function SeriesStep({
  mode,
  factor,
  crop,
  region,
  scopes,
  data: all,
  spec,
  from,
  to,
  own,
}: {
  own: boolean;
  mode: 'dynamics' | 'region';
  factor: FactorId;
  crop: CropId;
  region: RegionId;
  scopes: GeoScope[];
  data: DataSeries[];
  spec: IndicatorSpec;
  from: number;
  to: number;
}) {
  const toDate = seasonDate(to);
  const fromDate = seasonDate(from);
  const used = mode === 'dynamics' ? all.slice(0, 1) : all;
  const usedScopes = mode === 'dynamics' ? scopes.slice(0, 1) : scopes;

  const series: ChartSeries[] = used.map((s, i) => ({
    id: String(usedScopes[i]),
    label: mode === 'dynamics' && factor !== 'diesel' ? CROPS[crop].name : scopeShort(usedScopes[i]),
    colorVar: seriesColor(factor, crop, i === 0),
    dashed: usedScopes[i] === 'russia',
    points: windowed(s, toDate, spec.window),
  }));

  const changes = used.map((s, i) => ({ scope: usedScopes[i], pct: changePct(s, fromDate, toDate) }));
  const ownPct = changes[0]?.pct ?? null;
  const others = changes.slice(1).map((c) => c.pct).filter((v): v is number => v !== null);
  let verdict: string | null = null;
  if (mode === 'region' && ownPct !== null && others.length) {
    const avg = others.reduce((a, b) => a + b, 0) / others.length;
    const diff = (ownPct - avg) * spec.good;
    if (own) verdict = diff < -3 ? RC.worseThanOthers : diff > 3 ? RC.betterThanOthers : RC.sameAsOthers;
    else if (Math.abs(diff) <= 3) verdict = RC.sameAsOthers;
    // «просела сильнее/слабее» — только про падение урожайности выбранного региона
    else if (factor === 'yield' && ownPct < 0) verdict = diff < 0 ? RC.deeperThan(scopeName(region)) : RC.shallowerThan(scopeName(region));
  }

  const lead = changes[0]?.pct != null ? RC.yieldDiff(REGIONS[region]?.name ?? region, formatPct(changes[0].pct)) : undefined;
  const q = mode === 'dynamics' ? D.dynamicsQuestion : RC.title;

  return (
    <div>
      <ChartFrame
        question={mode === 'dynamics' ? `${FACTOR_NAME[factor]}, ${scopeName(region)}` : q}
        lead={mode === 'dynamics' ? lead : verdict ?? undefined}
        unit={spec.unit}
        source={used.map(sourceOf)}
        className="!bg-bg/40"
      >
        <LineChart
          series={series}
          frequency={spec.frequency}
          formatValue={spec.axisFmt}
          height={260}
          ariaLabel={q}
        />
      </ChartFrame>
      {mode === 'region' && (
        <ul className="num mt-stack grid gap-gutter sm:grid-cols-3">
          {changes.map((c, i) => {
            const st: SignalStatus | null =
              c.pct === null ? null : c.pct * spec.good < -3 ? 'worse' : c.pct * spec.good > 3 ? 'better' : 'normal';
            const name = i === 0 ? (own ? RC.yours(scopeName(c.scope)) : RC.selected(scopeName(c.scope))) : scopeName(c.scope);
            return (
              <li key={String(c.scope)} className={`rounded-card border p-card-sm ${i === 0 ? 'border-accent/50 bg-accent-soft/30' : 'border-line'}`}>
                <p className="text-[13px] text-muted">{name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-[19px] font-semibold">{c.pct === null ? '—' : formatPct(c.pct)}</span>
                  {st && <StatusTag status={st} size="sm" />}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {from} → {to}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Шаг 4: фактор ───────────────────────────────────────────────────────────
function FactorStep({
  factor,
  crop,
  region,
  to,
}: {
  factor: FactorId;
  crop: CropId;
  region: RegionId;
  to: number;
}) {
  if (factor === 'yield') {
    return (
      <div>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <CloudSunRain size={17} className="text-accent" aria-hidden />
          {W.factorCause.title} <span className="font-normal text-muted">· {DX.seasonWeatherOf(String(to))}</span>
        </p>
        <div className="mt-stack">
          <WithSeries
            keys={[
              { indicator: 'precipitation', region, frequency: 'month' },
              { indicator: 'temperature_mean', region, frequency: 'month' },
            ]}
            loading={
              <LoadingState label={texts.common.loading.default} framed={false}>
                <Skeleton height={96} className="rounded-card" />
                <Skeleton height={220} />
              </LoadingState>
            }
            errorMessage={texts.common.errors.load}
          >
            {([precipitation, temperature]) => (
              <SeasonWeather region={region} crop={crop} year={to} precipitation={precipitation} temperature={temperature} />
            )}
          </WithSeries>
        </div>
        <Button variant="text" size="sm" to={harvestLink({ crop, region })} iconRight={<ArrowRight size={14} aria-hidden />} className="mt-stack">
          {W.factorCause.link}
        </Button>
      </div>
    );
  }
  const text = factor === 'price' ? DX.priceCause : factor === 'diesel' ? DX.dieselCause : DX.otherCostsCause;
  return (
    <div>
      <p className="max-w-prose text-[15px] leading-relaxed text-ink/85">{text}</p>
      <div className="mt-stack flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {factor === 'price' && (
          <>
            <Button wrap to={marketLink({ crop, region, focus: 'price' })} iconRight={<ArrowRight size={16} aria-hidden />}>
              {ROUTES.market.title}
            </Button>
            <Button variant="secondary" wrap to={whatIfLink({ crop })}>
              {DX.toWhatIf}
            </Button>
          </>
        )}
        {factor === 'diesel' && (
          <Button wrap to={marketLink({ focus: 'diesel' })} iconRight={<ArrowRight size={16} aria-hidden />}>
            {ROUTES.market.title}
          </Button>
        )}
        {factor === 'otherCosts' && (
          <Button wrap to={ROUTES.farm.path} iconRight={<ExternalLink size={15} aria-hidden />}>
            {texts.common.actions.editFarm}
          </Button>
        )}
      </div>
    </div>
  );
}

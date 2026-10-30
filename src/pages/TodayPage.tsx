// «Мой бизнес сегодня»: итог в рублях за период, 4 фактора, лента «Что изменилось», совет (сценарий С1).
import { Lightbulb } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AssumptionBadge, DemoBadge } from '../components/Badges';
import FactorCard from '../components/FactorCard';
import KpiCard from '../components/KpiCard';
import Segmented from '../components/Segmented';
import SourceNote from '../components/SourceNote';
import StatusTag from '../components/StatusTag';
import { ErrorState, LoadingState, Skeleton } from '../components/States';
import FarmHeader from '../components/today/FarmHeader';
import { buildTodayModel, factorStatus, mainCrop, useFarmMarket, type Period } from '../components/today/farmModel';
import SignalList from '../components/today/SignalList';
import { useFarmProfile } from '../components/useFarmProfile';
import { CROPS, REGIONS } from '../config/regions';
import { texts } from '../content/texts';
import { useForecast } from '../hooks/useData';
import { sourceOf } from '../lib/data';
import { breakevenCushion, chaToT } from '../lib/finance';
import { formatDate, formatNumber, formatPct, formatRub } from '../lib/format';
import { buildRegionalProfile, seasonalDeviation } from '../lib/seasonality';
import { buildSignals, detectWeatherRisks, pickAdvice } from '../lib/signals';
import { harvestLink, marketLink, readParams, ROUTES, todayLink } from '../routes';
import type { CropId, FactorAnalysis, FactorId, SeasonalDeviation, SignalContext, WeatherRisk } from '../types';

const T = texts.today;
const C = texts.common;

export default function TodayPage() {
  // «Повторить» после ошибки — перемонтирование: загрузчик не кэширует ошибки, ряды запросятся заново
  const [attempt, setAttempt] = useState(0);
  return <TodayInner key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function TodayInner({ onRetry }: { onRetry: () => void }) {
  const { profile } = useFarmProfile();
  const params = readParams(useLocation().search);
  const period: Period = params.get('period') === 'year' ? 'year' : 'month';
  const cropParam = params.get('crop') as CropId | null;
  const selected: CropId | null =
    cropParam && profile.crops.some((c) => c.crop === cropParam) ? cropParam : mainCrop(profile);

  const { status, market } = useFarmMarket(profile);
  const region = REGIONS[profile.region] ?? null;
  const forecast = useForecast(region);

  const model = useMemo(() => (market ? buildTodayModel(profile, market, period) : null), [market, profile, period]);

  const risks: WeatherRisk[] = useMemo(() => {
    if (forecast.status !== 'ready') return [];
    try {
      return detectWeatherRisks(forecast.data.data);
    } catch {
      return [];
    }
  }, [forecast]);

  const seasonality: SeasonalDeviation[] = useMemo(() => {
    if (!market) return [];
    const out: SeasonalDeviation[] = [];
    for (const c of market.crops) {
      try {
        // Форма сезонности — по России (5 лет), уровень — по региональному ряду (короче)
        out.push(seasonalDeviation(c.data.price, buildRegionalProfile(c.russiaPrice, c.data.price), { date: market.date }));
      } catch {
        /* мало лет в ряду — без сезонного сигнала */
      }
    }
    return out;
  }, [market]);

  const signals = useMemo(() => {
    if (!model || !market) return [];
    const ctx: SignalContext = {
      profile,
      analyses: model.analyses,
      seasonality,
      weatherRisks: risks,
      sources: {
        price: market.sources.price,
        diesel: market.sources.diesel,
        yield: market.sources.yield,
        seasonality: market.sources.price,
        ...(forecast.status === 'ready' ? { weather: forecast.data.source } : {}),
      },
    };
    return buildSignals(ctx);
  }, [model, market, profile, seasonality, risks, forecast]);
  const advice = useMemo(() => pickAdvice(signals), [signals]);

  const periodOptions = [
    { id: 'month' as const, label: T.period.month, to: todayLink({ crop: selected ?? undefined }) },
    { id: 'year' as const, label: T.period.year, to: todayLink({ period: 'year', crop: selected ?? undefined }) },
  ];
  const periodCaption = (period === 'month' ? T.period.month : T.period.year).toLowerCase();
  const periodLong = period === 'month' ? T.period.monthLong : T.period.yearLong;
  const hasAssumptions = profile.crops.some(
    (c) => c.yieldCha.assumption || Object.values(c.costs).some((v) => v.assumption),
  );

  return (
    <main className="mx-auto max-w-page px-4 pb-section-lg pt-page-top sm:px-6 sm:pt-page-top-lg lg:px-8">
      <FarmHeader profile={profile} />
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] leading-[1.1] sm:text-[40px]">{ROUTES.today.title}</h1>
          <p className="mt-2 text-[16px] text-ink/75">{T.title}</p>
        </div>
        <Segmented label={T.period.label} options={periodOptions} value={period} replace={false} />
      </div>

      {status === 'loading' && (
        <div className="mt-block-lg grid gap-gutter lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <LoadingState label={C.loading.calc}>
            <Skeleton height={28} width="55%" />
            <Skeleton height={52} width="70%" />
            <Skeleton height={20} />
            <Skeleton height={20} width="85%" />
            <Skeleton height={120} />
          </LoadingState>
          <div className="grid grid-cols-2 gap-gutter" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={150} className="rounded-card" />
            ))}
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="mt-block-lg grid gap-gutter lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <ErrorState
            message={C.errors.loadSeries(texts.factors.price.name)}
            onRetry={onRetry}
            action={
              <Link to={ROUTES.sources.path} className="link text-sm">
                {C.actions.toSources}
              </Link>
            }
          />
          {/* Погода от рядов цен не зависит — карточка остаётся рабочей */}
          {region && (
            <FactorCard
              kind="weather"
              title={texts.factors.weather.name}
              status={risks.find((r) => r.status === 'worse')?.status ?? 'normal'}
              effectRub={null}
              headline={T.weatherCard.note}
              changePct={null}
              changeCaption={(risks.find((r) => r.status === 'worse') ?? risks[0])?.text ?? T.weatherCard.noRisks}
              link={harvestLink({ region: profile.region })}
              source={forecast.status === 'ready' ? forecast.data.source : undefined}
            />
          )}
        </div>
      )}

      {model && market && selected && (
        <TodayBody
          model={model}
          market={market}
          profile={profile}
          selected={selected}
          period={period}
          periodCaption={periodCaption}
          periodLong={periodLong}
          hasAssumptions={hasAssumptions}
          risks={risks}
          forecastSource={forecast.status === 'ready' ? forecast.data.source : null}
          forecastFromCache={forecast.status === 'ready' && forecast.data.origin === 'cache'}
          signals={signals}
          advice={advice}
        />
      )}
    </main>
  );
}

// Названия причин в главной фразе — в нижнем регистре
const CAUSE_NAME: Record<FactorId, string> = T.total.causeNames;
/** «₽/га» не разрывается переносом после «/» */
const nb = (s: string) => s.replace('/', '/\u2060');

/** С1: «За месяц прибыль с гектара пшеницы +5 944 ₽/га: цена +7% (+6 325 ₽/га), солярка +8,8% (−381 ₽/га)» */
function headlineFor(a: FactorAnalysis, periodLong: string, cropGen: string, notPublished?: string): string {
  const causes = a.contributions
    .filter((c) => Math.round(c.effectPerHa) !== 0)
    .sort((x, y) => Math.abs(y.effectPerHa) - Math.abs(x.effectPerHa))
    .map((c) =>
      T.total.causePart(
        CAUSE_NAME[c.factor],
        c.changePct === null ? '' : formatPct(c.changePct),
        nb(formatRub(c.effectPerHa, { unit: '₽/га', sign: true })),
      ),
    )
    .join(T.total.causesJoin);
  // Цена за месяц не сдвинулась, потому что Росстат ещё не опубликовал месяц, — так и говорим
  const lag = notPublished ? T.detail.priceNotPublished(notPublished) : '';
  const rub = nb(formatRub(a.totalChangePerHa, { unit: '₽/га', sign: true }));
  if (!causes) return T.total.headline(periodLong, cropGen, rub, lag);
  return `${T.total.headline(periodLong, cropGen, rub, causes)}${lag ? `. ${lag}` : ''}`;
}

type BodyProps = {
  model: NonNullable<ReturnType<typeof buildTodayModel>>;
  market: NonNullable<ReturnType<typeof useFarmMarket>['market']>;
  profile: ReturnType<typeof useFarmProfile>['profile'];
  selected: CropId;
  period: Period;
  periodCaption: string;
  periodLong: string;
  hasAssumptions: boolean;
  risks: WeatherRisk[];
  forecastSource: import('../types').SourceRef | null;
  forecastFromCache: boolean;
  signals: ReturnType<typeof buildSignals>;
  advice: ReturnType<typeof pickAdvice>;
};

function TodayBody({
  model,
  market,
  profile,
  selected,
  period,
  periodCaption,
  periodLong,
  hasAssumptions,
  risks,
  forecastSource,
  forecastFromCache,
  signals,
  advice,
}: BodyProps) {
  const a = model.analyses.find((x) => x.crop === selected) ?? model.analyses[0];
  const cropMarket = market.crops.find((c) => c.plan.crop === a?.crop);
  const cropEcon = model.econ.crops.find((c) => c.crop === a?.crop);
  const crop = a ? CROPS[a.crop] : null;
  const contrib = (f: FactorId) => a?.contributions.find((c) => c.factor === f);
  const multiCrop = profile.crops.length > 1;
  const priceSrc = cropMarket ? sourceOf(cropMarket.data.price) : market.sources.price;
  const yieldSrc = cropMarket ? sourceOf(cropMarket.data.yield) : market.sources.yield;
  const dieselSrc = market.sources.diesel;
  const perHaFarm = model.totalAreaHa > 0 ? model.totalChange / model.totalAreaHa : 0;
  const totalStatus = model.totalChange > 0 ? 'better' : model.totalChange < 0 ? 'worse' : 'normal';
  const cropTotal = (rub: number) =>
    multiCrop && crop
      ? texts.factors.effect.cropTotal(formatRub(rub, { sign: true }), crop.nameGenitive)
      : texts.factors.effect.total(formatRub(rub, { sign: true }));

  const price = contrib('price');
  const diesel = contrib('diesel');
  const yld = contrib('yield');
  const worstRisk = risks.find((r) => r.status === 'worse') ?? risks[0];
  const notPublished = model.period === 'month' && a ? model.priceNotPublished[a.crop] : undefined;

  return (
    <>
    {/* Телефон: итог → факторы → показатели → лента; десктоп: итог | показатели, ниже факторы и лента */}
    <div className="mt-block-lg grid gap-x-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      {/* Итог */}
      <section className="contents">
        <div className="relative order-1 overflow-hidden rounded-sheet border border-line bg-surface p-card sm:p-card-lg lg:col-start-1 lg:row-start-1">
          <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-accent" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg leading-tight sm:text-xl">{T.total.title}</h2>
            <span className="num text-xs text-muted">
              {formatDate(model.baseDate, 'long')} → {formatDate(model.date, 'long')}
            </span>
          </div>
          <p className="num-display mt-4 text-[38px] font-semibold leading-none sm:text-[52px]">
            {formatRub(model.totalChange, { sign: true })}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusTag status={totalStatus} size="sm" />
            <span className="num text-sm text-ink/80">
              {formatRub(perHaFarm, { unit: '₽/га', sign: true })} {T.total.avgPerHa}
            </span>
          </div>
          {a && crop && (
            <p className="mt-4 max-w-[46ch] text-[17px] leading-snug">
              {headlineFor(a, periodLong, crop.nameGenitive, notPublished)}
            </p>
          )}
          <p className="mt-3 max-w-prose text-xs leading-relaxed text-muted">{T.total.seasonNote}</p>
          <SourceNote source={market.sources.all} className="mt-4 border-t border-line pt-3" />
        </div>

        <div className="order-3 mt-block-lg grid grid-cols-2 content-start gap-2 sm:gap-3 lg:col-start-2 lg:row-start-1 lg:mt-0">
          <KpiCard
            label={T.total.profitNow}
            value={formatRub(model.econ.profit, { compact: true })}
            badge={hasAssumptions ? <AssumptionBadge size="sm" /> : undefined}
          />
          <KpiCard label={T.total.marginNow} value={formatRub(model.econ.marginPerHa, { unit: '₽/га' })} />
          {cropEcon && crop && (
            <>
              <KpiCard
                label={`${T.total.costPerT} = ${T.total.breakeven.toLowerCase()}: ${crop.name.toLowerCase()}`}
                value={cropEcon.costPerT === null ? '—' : formatRub(cropEcon.costPerT, { unit: '₽/т' })}
                hint={T.total.priceNow(formatRub(cropEcon.pricePerT, { unit: '₽/т' }))}
              />
              {(() => {
                const cushion = breakevenCushion(cropEcon).pricePct;
                return (
                  <KpiCard
                    label={texts.whatIf.breakeven.title}
                    value={cushion === null ? '—' : formatPct(cushion, { sign: false, fractionDigits: 0 })}
                    status={cushion !== null && cushion < 0 ? 'worse' : undefined}
                    hint={
                      cushion === null
                        ? undefined
                        : cushion < 0
                          ? texts.whatIf.breakeven.belowAlready
                          : texts.whatIf.breakeven.cushionPrice(formatPct(cushion, { sign: false, fractionDigits: 0 }))
                    }
                  />
                );
              })()}
            </>
          )}
        </div>
      </section>

      {/* Факторы */}
      <section className="order-2 mt-section lg:col-span-2 lg:row-start-2 lg:mt-section">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] leading-tight sm:text-[26px]">{T.factorsTitle}</h2>
            <p className="mt-1.5 text-[15px] text-ink/75">{T.factorsLead}</p>
          </div>
          {multiCrop && (
            <Segmented
              label={T.cropSwitch}
              size="sm"
              value={selected}
              options={profile.crops.map((c) => ({
                id: c.crop,
                label: CROPS[c.crop].name,
                to: todayLink({ period: period === 'year' ? period : undefined, crop: c.crop }),
              }))}
            />
          )}
        </div>

        {a && crop ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {price && (
              <FactorCard
                kind="price"
                title={texts.factors.price.forCrop(crop.nameGenitive)}
                status={notPublished ? 'normal' : factorStatus(price.changePct, price.effectPerHa)}
                effectRub={price.effectPerHa}
                changePct={notPublished ? null : price.changePct}
                changeCaption={notPublished ? undefined : periodCaption}
                valueText={formatRub(price.to, { unit: '₽/т' })}
                detail={notPublished ? T.detail.priceNotPublished(notPublished) : cropTotal(price.effectTotal)}
                link={marketLink({ crop: a.crop, region: profile.region, focus: 'price' })}
                source={priceSrc}
              />
            )}
            {diesel && (
              <FactorCard
                kind="diesel"
                title={texts.factors.diesel.name}
                status={factorStatus(diesel.changePct, diesel.effectPerHa)}
                effectRub={diesel.effectPerHa}
                changePct={diesel.changePct}
                changeCaption={periodCaption}
                valueText={`${formatNumber(diesel.to, 2)}\u00a0${C.units.rubPerL} ${C.labels.dieselRussia}`}
                detail={
                  <>
                    {a.current.yieldCha > 0
                      ? T.detail.dieselRubPerT(formatRub(diesel.effectPerHa / chaToT(a.current.yieldCha), { unit: '₽/т', sign: true }))
                      : cropTotal(diesel.effectTotal)}
                    <span className="mt-1 block text-xs text-muted" title={C.labels.dieselRussiaHint}>
                      {T.detail.dieselScope}
                    </span>
                  </>
                }
                link={marketLink({ region: profile.region, focus: 'diesel' })}
                source={dieselSrc}
              />
            )}
            {yld && (
              <FactorCard
                kind="yield"
                title={texts.factors.yield.name}
                status={period === 'month' ? 'normal' : factorStatus(yld.changePct, yld.effectPerHa)}
                effectRub={yld.effectPerHa}
                changePct={yld.changePct ?? 0}
                changeCaption={periodCaption}
                valueText={`${formatNumber(yld.to, 1)} ${C.units.chaPerHa}`}
                detail={
                  period === 'month' ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {texts.factors.yield.planUnchanged}
                      {cropMarket?.plan.yieldCha.assumption && <AssumptionBadge size="sm" />}
                    </span>
                  ) : (
                    cropTotal(yld.effectTotal)
                  )
                }
                link={harvestLink({ crop: a.crop, region: profile.region })}
                source={period === 'year' ? yieldSrc : undefined}
              />
            )}
            <FactorCard
              kind="weather"
              title={texts.factors.weather.name}
              status={worstRisk ? worstRisk.status : 'normal'}
              effectRub={null}
              headline={T.weatherCard.note}
              changePct={null}
              changeCaption={worstRisk ? worstRisk.text : T.weatherCard.noRisks}
              detail={
                forecastFromCache && forecastSource ? (
                  <span className="block rounded-control bg-status-normal-bg px-2.5 py-1.5 text-[13px] text-ink">
                    {C.weather.cacheNotice(formatDate(forecastSource.updated_at, 'long'))}
                  </span>
                ) : (
                  T.weatherCard.lead
                )
              }
              link={harvestLink({ crop: a.crop, region: profile.region })}
              source={forecastSource ?? undefined}
            />
          </div>
        ) : (
          <p className="mt-5 text-muted">{C.empty.noRegionData}</p>
        )}
      </section>

      {/* Что изменилось + совет */}
      <section className="order-4 mt-section grid gap-8 lg:col-span-2 lg:row-start-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          <h2 className="text-[22px] leading-tight sm:text-[26px]">{T.changesTitle}</h2>
          <p className="mt-1.5 mb-5 text-[15px] text-ink/75">{T.changesLead}</p>
          <SignalList signals={signals.slice(0, 3)} />
        </div>
        <aside>
          <div className="rounded-sheet bg-accent p-6 text-accent-ink dark:border dark:border-accent/30 dark:bg-accent-soft dark:text-ink sm:p-7 lg:sticky lg:top-6">
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.1em] opacity-85">
              <Lightbulb size={16} aria-hidden />
              {T.adviceTitle}
            </p>
            {advice ? (
              <>
                <div className="mt-4">
                  <span className="rounded-tag bg-surface px-1 py-0.5">
                    <StatusTag status={advice.status} size="sm" plain />
                  </span>
                </div>
                <p className="mt-3 text-[18px] leading-snug">{advice.text}</p>
                <p className="mt-3 text-xs opacity-80">{T.adviceFrom}</p>
                <Link
                  to={advice.link}
                  className="mt-4 inline-flex text-sm font-semibold underline decoration-current/40 underline-offset-4"
                >
                  {C.actions.more}
                </Link>
              </>
            ) : (
              <p className="mt-4 text-[17px] leading-snug">{T.adviceEmpty}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              {market.sources.all.some((s) => s.demo) && <DemoBadge size="sm" />}
              {profile.crops.some((c) => Object.values(c.costs).some((v) => v.assumption)) && <AssumptionBadge size="sm" />}
            </div>
          </div>
        </aside>
      </section>

      <p className="order-5 mt-section text-sm lg:col-span-2 lg:row-start-4">
        <Link to={ROUTES.why.path} className="link">
          {ROUTES.why.title}
        </Link>
        <span className="text-muted"> · </span>
        <Link to={ROUTES.whatIf.path} className="link">
          {ROUTES.whatIf.title}
        </Link>
      </p>
    </div>
    </>
  );
}

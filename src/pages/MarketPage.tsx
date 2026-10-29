// «Рынок и сезонность» — «Выгодно ли продавать сейчас?» (сценарий С2; С1 приходит сюда с ?focus=diesel).
// Цена производителей + сезонная норма → вердикт → «Что если» с подставленной ценой; ниже — солярка по неделям
// с пересчётом в рубли для хозяйства и одна строка о ключевой ставке.
import { ArrowRight, Landmark } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DemoBadge } from '../components/Badges';
import Button from '../components/Button';
import ChartFrame from '../components/ChartFrame';
import LineChart, { type ChartSeries } from '../components/LineChart';
import SeasonStrip, { PHASE_LABEL, seasonNow } from '../components/SeasonStrip';
import SourceNote from '../components/SourceNote';
import StatusTag from '../components/StatusTag';
import DieselImpact, { type DieselImpactRow } from '../components/market/DieselImpact';
import { ErrorState, LoadingState, Skeleton } from '../components/States';
import PagePicker from '../components/market/PagePicker';
import SeasonalProfileChart from '../components/market/SeasonalProfileChart';
import { phaseMonths } from '../components/market/phaseMonths';
import { useSelection } from '../components/market/useSelection';
import { useFarmProfile } from '../components/useFarmProfile';
import { CROPS, REGIONS } from '../config/regions';
import { texts } from '../content/texts';
import { useSeries, useSeriesList } from '../hooks/useData';
import { sourceOf } from '../lib/data';
import { computeCropEconomics, factorAnalysis, periodStateAt } from '../lib/finance';
import { MONTHS_PREP, formatDate, formatNumber, formatPct, formatRub } from '../lib/format';
import { cropShortName } from '../lib/signals';
import { buildSeasonalProfile, seasonalDeviation } from '../lib/seasonality';
import { changePct, monthAgo, numberAt, validPoints } from '../lib/series';
import { marketLink, whatIfLink } from '../routes';
import type { CropId, DataSeries, FarmProfile, RegionId, SeasonPhaseId, SeriesKey, SignalStatus } from '../types';

const M = texts.market;
const C = texts.common;

const VERDICT_LABEL: Record<SignalStatus, string> = M.verdict.labels;
const L_SEASON_TITLE = texts.home.seasonStrip.title;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MarketPage() {
  const { profile } = useFarmProfile();
  const { region, crop, focus } = useSelection(profile);
  const regionCfg = REGIONS[region];
  const cropCfg = CROPS[crop];
  const today = todayIso();

  // Три независимых блока: цена, солярка, ставка. Отказ одного ряда не гасит остальные.
  // Повтор — перемонтирование блока по ключу (useSeries загрузит ряд заново; ошибки загрузчик не кэширует).
  const [retry, setRetry] = useState({ price: 0, diesel: 0, rate: 0 });
  const bump = (k: keyof typeof retry) => () => setRetry((r) => ({ ...r, [k]: r[k] + 1 }));

  const link = (p: { region: RegionId; crop: CropId }) => marketLink({ ...p, focus: focus === 'diesel' ? 'diesel' : undefined });

  return (
    <main className="mx-auto max-w-page px-4 pb-section-lg pt-page-top sm:px-6 sm:pt-page-top-lg lg:px-8">
      <header>
        <p className="kicker">
          {C.nav.market} · {regionCfg.name}
        </p>
        <h1 className="mt-stack text-[28px] font-semibold leading-[1.12] sm:text-[38px]">{M.title}</h1>
        <PagePicker
          className="mt-block"
          region={region}
          crop={crop}
          profileCrops={region === profile.region ? profile.crops.map((c) => c.crop) : []}
          link={link}
        />
      </header>

      <PriceArea
        key={`price-${region}-${crop}-${retry.price}`}
        region={region}
        crop={crop}
        today={today}
        cropName={cropCfg.name}
        onRetry={bump('price')}
      />
      <DieselArea
        key={`diesel-${region}-${retry.diesel}`}
        region={region}
        profile={profile}
        focus={focus}
        onRetry={bump('diesel')}
      />
      <KeyRateArea key={`rate-${retry.rate}`} onRetry={bump('rate')} />
    </main>
  );
}

// ── Цена: вердикт, полоса сезона, графики ──────────────────────────────────
function PriceArea({
  region,
  crop,
  today,
  cropName,
  onRetry,
}: {
  region: RegionId;
  crop: CropId;
  today: string;
  cropName: string;
  onRetry: () => void;
}) {
  const st = useSeries({ indicator: 'producer_price', region, crop, frequency: 'month' });
  const [activePhase, setActivePhase] = useState<SeasonPhaseId | undefined>(undefined);
  const regionCfg = REGIONS[region];
  const phases = regionCfg.season[crop];
  const now = phases ? seasonNow(phases, today) : null;
  const shownPhase = activePhase ?? now?.phase ?? undefined;

  const strip = phases ? (
    <section aria-labelledby="season-title" className="rounded-card border border-line bg-surface p-card sm:p-card-lg">
      <h2 id="season-title" className="text-xl leading-tight sm:text-[22px]">
        {L_SEASON_TITLE}
      </h2>
      <p className="mt-1.5 text-[15px] leading-snug text-ink/75">{M.seasonStripLead}</p>
      <SeasonStrip
        className="mt-block"
        phases={phases}
        date={today}
        caption={`${cropName}, ${regionCfg.shortName}`}
        activePhase={activePhase}
        onSelect={(id) => setActivePhase((cur) => (cur === id ? undefined : id))}
      />
      {shownPhase && (
        <p className="mt-stack border-t border-line pt-stack text-sm leading-relaxed text-ink/80">
          <span className="font-semibold text-ink">{PHASE_LABEL[shownPhase]}.</span> {texts.seasonStrip.phaseHint[shownPhase]}
        </p>
      )}
    </section>
  ) : null;

  if (st.status !== 'ready')
    return (
      <>
        <section className="mt-block grid items-stretch gap-block lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-block-lg">
          {st.status === 'loading' ? (
            <LoadingState label={C.loading.chart}>
              <Skeleton height={56} width="40%" />
              <Skeleton height={20} />
              <Skeleton height={20} width="75%" />
              <Skeleton height={44} width="60%" />
            </LoadingState>
          ) : (
            <ErrorState message={C.errors.loadSeries(M.priceChart.title)} onRetry={onRetry} />
          )}
          {strip}
        </section>
        {st.status === 'loading' && (
          <div className="mt-block grid gap-block lg:grid-cols-2">
            <LoadingState label={C.loading.chart}>
              <Skeleton height={280} />
            </LoadingState>
            <LoadingState label={C.loading.chart}>
              <Skeleton height={280} />
            </LoadingState>
          </div>
        )}
      </>
    );

  return (
    <MarketBody
      price={st.data}
      crop={crop}
      cropName={cropName}
      strip={strip}
      activePhase={activePhase}
      phaseMonthsList={activePhase && phases ? phaseMonths(phases.find((p) => p.id === activePhase)!) : []}
      onRetry={onRetry}
    />
  );
}

interface BodyProps {
  price: DataSeries;
  crop: CropId;
  cropName: string;
  strip: ReactNode;
  activePhase?: SeasonPhaseId;
  phaseMonthsList: number[];
  onRetry: () => void;
}

function MarketBody({ price, crop, cropName, strip, activePhase, phaseMonthsList, onRetry }: BodyProps) {
  const cropCfg = CROPS[crop];
  const highlightMonths = phaseMonthsList;
  const profileModel = useMemo(() => buildSeasonalProfile(price), [price]);
  const dev = useMemo(() => {
    try {
      return seasonalDeviation(price, profileModel);
    } catch {
      return null;
    }
  }, [price, profileModel]);

  // Цена за 24 месяца и норма месяца на тех же датах (одна ось, пунктир)
  const priceSeries: ChartSeries[] = useMemo(() => {
    const pts = validPoints(price.series).slice(-24);
    return [
      { id: 'price', label: cropShortName(crop), colorVar: cropCfg.colorVar, points: pts },
      {
        id: 'norm',
        label: M.seasonChart.normShort,
        colorVar: cropCfg.colorVar,
        dashed: true,
        points: pts.map((p) => ({ date: p.date, value: profileModel.months[Number(p.date.slice(5, 7)) - 1]?.normPrice ?? null })),
      },
    ];
  }, [price, profileModel, crop, cropCfg.colorVar]);

  const best = [...profileModel.months].sort((a, b) => b.index - a.index)[0];
  const worst = [...profileModel.months].sort((a, b) => a.index - b.index)[0];
  const years = profileModel.years;

  return (
    <>
      {/* Вердикт + полоса сезона */}
      <section className="mt-block grid items-stretch gap-block lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-block-lg">
        {dev ? (
          <Verdict
            crop={crop}
            cropGenitive={cropCfg.nameGenitive}
            deviationPct={dev.deviationPct}
            status={dev.status}
            date={dev.date}
            currentPrice={dev.currentPrice}
            normPrice={dev.normPrice}
            min={profileModel.months[dev.month - 1]?.min}
            max={profileModel.months[dev.month - 1]?.max}
            source={price}
          />
        ) : (
          <ErrorState message={C.errors.loadSeries(M.verdict.title)} onRetry={onRetry} />
        )}
        {strip}

      </section>

      {/* Цена по месяцам и сезонный профиль */}
      <section className="mt-block grid gap-block lg:grid-cols-2">
        <ChartFrame
          id="price"
          as="h2"
          question={M.priceChart.title}
          lead={M.priceChart.lead}
          unit={M.priceChart.yAxis}
          source={sourceOf(price)}
        >
          <LineChart
            series={priceSeries}
            frequency="month"
            height={280}
            formatValue={(v) => formatNumber(v)}
            ariaLabel={`${M.priceChart.title} ${cropName}`}
          />
        </ChartFrame>

        <ChartFrame
          as="h2"
          question={M.seasonChart.title}
          lead={
            <>
              {M.seasonChart.bestMonth(MONTHS_PREP[best.month - 1])}. {M.seasonChart.worstMonth(MONTHS_PREP[worst.month - 1])}.
            </>
          }
          unit={M.priceChart.yAxis}
          source={profileModel.source}
          sourceNote={years.length ? M.seasonChart.yearsCaption(String(years[0]), String(years[years.length - 1])) : undefined}
        >
          <SeasonalProfileChart
            profile={profileModel}
            colorVar={cropCfg.colorVar}
            current={dev ? { month: dev.month, price: dev.currentPrice } : null}
            phaseMonths={highlightMonths}
            height={280}
            ariaLabel={M.seasonChart.lead}
          />
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 px-3 pb-1 pt-1 text-xs text-muted sm:px-3">
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-3.5 rounded-[2px]" style={{ background: `rgb(var(${cropCfg.colorVar}) / 0.25)` }} />
              {M.seasonChart.range}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: `rgb(var(${cropCfg.colorVar}))` }} />
              {M.seasonChart.norm}
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-ink" />
              {M.priceChart.current}
            </li>
            {activePhase && (
              <li className="flex items-center gap-2 font-medium text-ink">
                <span aria-hidden className="inline-block h-3 w-3.5 rounded-[2px]" style={{ background: `rgb(var(${cropCfg.colorVar}) / 0.45)` }} />
                {PHASE_LABEL[activePhase]}
              </li>
            )}
          </ul>
        </ChartFrame>
      </section>
    </>
  );
}

// ── Вердикт ────────────────────────────────────────────────────────────────
function Verdict(props: {
  crop: CropId;
  cropGenitive: string;
  deviationPct: number;
  status: SignalStatus;
  date: string;
  currentPrice: number;
  normPrice: number;
  min?: number;
  max?: number;
  source: DataSeries;
}) {
  const { crop, cropGenitive, deviationPct, status, date, currentPrice, normPrice, min, max, source } = props;
  const month = formatDate(date, 'monthGenitive');
  const pctAbs = formatPct(Math.abs(deviationPct), { sign: false, fractionDigits: 0 });
  const sentence =
    status === 'better'
      ? M.verdict.above(cropGenitive, pctAbs, month)
      : status === 'worse'
        ? M.verdict.below(cropGenitive, pctAbs, month)
        : M.verdict.near(cropGenitive, month);
  // С2: «что будет, если подождать, а цена вернётся к обычной» — сдвиг от текущей цены к норме
  const pricePct = currentPrice > 0 ? Math.max(-30, Math.min(30, Math.round((normPrice / currentPrice - 1) * 100))) : 0;
  const whatIf =
    status === 'better'
      ? { to: whatIfLink({ crop, pricePct }), label: M.verdict.whatIfAbove }
      : status === 'worse'
        ? { to: whatIfLink({ crop, pricePct }), label: M.verdict.whatIfBelow }
        : { to: whatIfLink({ crop }), label: M.verdict.toWhatIf };
  const monthName = formatDate(date, 'month');

  return (
    <section
      aria-labelledby="verdict-title"
      aria-live="polite"
      className="paper-ruled relative overflow-hidden rounded-sheet border border-line bg-surface shadow-raise"
    >
      <span aria-hidden className="absolute inset-y-0 left-10 w-px bg-status-worse/25 sm:left-12" />
      <div className="relative py-card pl-14 pr-card sm:py-card-lg sm:pl-[4.25rem] sm:pr-card-lg">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="verdict-title" className="kicker !font-sans">
            {M.verdict.title}
          </h2>
          {source.demo && <DemoBadge size="sm" />}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="num-display text-[46px] font-semibold leading-none sm:text-[58px]">
            {formatPct(deviationPct, { fractionDigits: 0 })}
          </p>
          <div className="pb-1">
            <StatusTag status={status} label={VERDICT_LABEL[status]} />
            <p className="mt-1.5 text-sm text-muted">{M.verdict.vsNorm(month)}</p>
          </div>
        </div>
        <p className="mt-4 max-w-[38ch] text-[18px] leading-snug sm:text-[19px]">{sentence}</p>

        <dl className="num mt-block grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted">{M.verdict.priceNow(monthName)}</dt>
            <dd className="mt-1 whitespace-nowrap text-[17px] font-semibold">{formatRub(currentPrice, { unit: '₽/т' })}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted">{M.verdict.normFor(month)}</dt>
            <dd className="mt-1 whitespace-nowrap text-[17px] font-semibold">{formatRub(normPrice, { unit: '₽/т' })}</dd>
          </div>
          {min != null && max != null && (
            <div className="min-w-0">
              <dt className="text-xs text-muted">{M.seasonChart.range}</dt>
              <dd className="mt-1 whitespace-nowrap text-[17px] font-semibold">
                {formatNumber(min)} – {formatNumber(max)}
              </dd>
            </div>
          )}
        </dl>

        <Button
          to={whatIf.to}
          wrap
          className="mt-block w-full sm:w-auto"
          iconRight={<ArrowRight size={17} aria-hidden />}
        >
          {whatIf.label}
        </Button>
        <SourceNote source={sourceOf(source)} hideDemoBadge className="mt-4" />
      </div>
    </section>
  );
}

// ── Солярка ────────────────────────────────────────────────────────────────
function DieselArea({
  region,
  profile,
  focus,
  onRetry,
}: {
  region: RegionId;
  profile: FarmProfile;
  focus: string | null;
  onRetry: () => void;
}) {
  const st = useSeries({ indicator: 'diesel_price', region, frequency: 'week' });
  // Ряды для пересчёта солярки в рубли — по профилю хозяйства (его регион и культуры)
  const farmKeys: SeriesKey[] = [
    { indicator: 'diesel_price', region: profile.region, frequency: 'week' },
    ...profile.crops.map((c): SeriesKey => ({ indicator: 'producer_price', region: profile.region, crop: c.crop, frequency: 'month' })),
    ...profile.crops.map((c): SeriesKey => ({ indicator: 'yield', region: profile.region, crop: c.crop, frequency: 'year' })),
  ];
  const farm = useSeriesList(farmKeys);

  // С1: из карточки «Солярка» — сразу к пересчёту и графику дизеля
  useEffect(() => {
    if (focus !== 'diesel' || st.status === 'loading') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(
      () => document.getElementById('diesel')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
      60,
    );
    return () => window.clearTimeout(t);
  }, [focus, st.status]);

  if (st.status === 'loading')
    return (
      <section id="diesel" className="mt-block scroll-mt-28 grid gap-block lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <LoadingState label={C.loading.chart}>
          <Skeleton height={400} />
        </LoadingState>
        <LoadingState label={C.loading.calc} className="order-first lg:order-none">
          <Skeleton height={44} width="70%" />
          <Skeleton height={20} />
          <Skeleton height={20} width="80%" />
        </LoadingState>
      </section>
    );
  if (st.status === 'error')
    return (
      <section id="diesel" className="mt-block scroll-mt-28">
        <ErrorState message={C.errors.loadSeries(M.dieselChart.title)} onRetry={onRetry} />
      </section>
    );
  return (
    <DieselSection
      diesel={st.data}
      region={region}
      profile={profile}
      farmData={farm.status === 'ready' ? farm.data : null}
      farmStatus={farm.status}
      onRetry={onRetry}
    />
  );
}

function DieselSection({
  diesel,
  region,
  profile,
  farmData,
  farmStatus,
  onRetry,
}: {
  diesel: DataSeries;
  region: RegionId;
  profile: FarmProfile;
  farmData: DataSeries[] | null;
  farmStatus: 'loading' | 'error' | 'ready';
  onRetry: () => void;
}) {
  const last = numberAt(diesel);
  const before = last ? monthAgo(last.date) : null;
  const ch = last && before ? changePct(diesel, before, last.date) : null;
  // База «за месяц» — тот же день месяц назад, как на «Мой бизнес сегодня»
  const changeText =
    ch == null ? '—' : before ? M.dieselChart.changeMonth(formatPct(ch), formatDate(before, 'dayMonth')) : M.dieselChart.changeMonthShort(formatPct(ch));
  const changeShort = ch == null ? '—' : M.dieselChart.changeMonthShort(formatPct(ch));

  const series: ChartSeries[] = useMemo(
    () => [{ id: 'diesel', label: texts.factors.diesel.name, colorVar: '--series-diesel', points: validPoints(diesel.series).slice(-52) }],
    [diesel],
  );

  // Рублёвый эффект — цепные подстановки finance.ts: меняется только цена дизеля за месяц
  const impact = useMemo(() => {
    if (!farmData || region !== profile.region) return null;
    const n = profile.crops.length;
    const fDiesel = farmData[0];
    const fLast = numberAt(fDiesel);
    if (!fLast) return null;
    const date = fLast.date;
    const base = monthAgo(date);
    try {
      const rows: DieselImpactRow[] = profile.crops.map((plan, i) => {
        const data = { price: farmData[1 + i], diesel: fDiesel, yield: farmData[1 + n + i] };
        const b = periodStateAt(plan, data, base);
        const cur = periodStateAt(plan, data, date);
        const fa = factorAnalysis(b, cur, plan.areaHa, plan.crop);
        const dc = fa.contributions.find((c) => c.factor === 'diesel');
        const econ = computeCropEconomics(plan, { pricePerT: cur.pricePerT, dieselPerL: cur.dieselPerL });
        const perHa = dc?.effectPerHa ?? 0;
        return {
          crop: plan.crop,
          areaHa: plan.areaHa,
          effectPerHa: perHa,
          effectTotal: dc?.effectTotal ?? 0,
          effectPerT: econ.yieldTPerHa > 0 ? perHa / econ.yieldTPerHa : null,
          fuelSharePct: econ.fuelSharePct,
          litersPerHa: plan.costs.fuelLitersPerHa.value,
          litersAssumption: plan.costs.fuelLitersPerHa.assumption,
        };
      });
      // итог округляем до тысяч, как в живой карточке главной
      return { rows, total: Math.round(rows.reduce((s, r) => s + r.effectTotal, 0) / 1000) * 1000 };
    } catch {
      return null;
    }
  }, [farmData, region, profile]);

  const mainPlan = [...profile.crops].sort((a, b) => b.areaHa - a.areaHa)[0];
  const mainRow = impact?.rows.find((r) => r.crop === mainPlan?.crop);

  return (
    <section id="diesel" className="mt-block scroll-mt-28 grid items-stretch gap-block lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <ChartFrame
        as="h2"
        question={M.dieselChart.title}
        lead={
          <>
            {M.dieselChart.lead} <span className="num font-semibold text-ink">{changeText}</span>
            {mainRow && (
              <>
                {'. '}
                {M.dieselChart.fuelShare(formatPct(mainRow.fuelSharePct, { sign: false, fractionDigits: 0 }))} (
                {CROPS[mainRow.crop].name.toLowerCase()}).
              </>
            )}
          </>
        }
        unit={M.dieselChart.yAxis}
        source={sourceOf(diesel)}
      >
        <LineChart
          series={series}
          frequency="week"
          height={400}
          formatValue={(v) => formatNumber(v, 1)}
          formatTooltipDate={(d) => formatDate(d, 'long')}
          ariaLabel={M.dieselChart.title}
        />
      </ChartFrame>
      {/* На телефоне пересчёт в рубли — над графиком (С1: сначала рубли, потом динамика) */}
      <DieselImpact
        className="order-first lg:order-none"
        rows={impact?.rows ?? null}
        total={impact?.total ?? 0}
        changePct={ch}
        changeText={changeShort}
        priceNow={last?.value ?? 0}
        otherRegion={region !== profile.region}
        farmStatus={farmStatus}
        onRetry={onRetry}
        sources={[sourceOf(diesel), ...(farmData ? farmData.slice(1, 1 + profile.crops.length).map(sourceOf) : [])]}
      />
    </section>
  );
}

// ── Ключевая ставка ────────────────────────────────────────────────────────
function KeyRateArea({ onRetry }: { onRetry: () => void }) {
  const st = useSeries({ indicator: 'key_rate', region: 'russia', frequency: 'event' });
  if (st.status === 'loading')
    return (
      <LoadingState className="mt-block" label={C.loading.default}>
        <Skeleton height={20} />
      </LoadingState>
    );
  if (st.status === 'error')
    return <ErrorState className="mt-block" message={C.errors.loadSeries(M.keyRate.title)} onRetry={onRetry} />;
  return <KeyRateLine series={st.data} />;
}

function KeyRateLine({ series }: { series: DataSeries }) {
  // Ряд ступенчатый: последняя ставка действует до даты актуальности ряда
  const last = numberAt(series);
  if (!last) return null;
  return (
    <section
      aria-labelledby="key-rate-title"
      className="mt-block flex flex-col gap-3 rounded-card border border-line bg-surface p-card sm:flex-row sm:items-center sm:gap-block sm:px-card-lg"
    >
      <h2 id="key-rate-title" className="flex shrink-0 items-center gap-2 font-sans text-base font-semibold">
        <Landmark size={18} className="text-accent" aria-hidden />
        {M.keyRate.title}
      </h2>
      <p className="num min-w-0 flex-1 text-[15px] leading-snug text-ink/85">
        {M.keyRate.line(formatPct(last.value, { sign: false, fractionDigits: 2 }), formatDate(series.updated_at, 'long'))}
      </p>
      <SourceNote source={sourceOf(series)} className="shrink-0 sm:max-w-[280px]" />
    </section>
  );
}


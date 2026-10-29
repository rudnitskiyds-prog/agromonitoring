// Главная (лендинг): тезис + живая карточка расчёта демо-хозяйства, полоса сезона, преимущества.
import { ArrowRight, CalendarRange, Coins, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AssumptionBadge, DemoBadge } from '../components/Badges';
import Button from '../components/Button';
import SeasonStrip from '../components/SeasonStrip';
import SourceNote from '../components/SourceNote';
import { ErrorState, LoadingState, Skeleton } from '../components/States';
import { CROPS, REGIONS } from '../config/regions';
import { texts } from '../content/texts';
import { loadSeries, sourceOf } from '../lib/data';
import { computeFarmEconomics, factorAnalysis, periodStateAt } from '../lib/finance';
import { formatDate, formatNumber, formatRub } from '../lib/format';
import { monthAgo, numberAt } from '../lib/series';
import { ROUTES } from '../routes';
import { DEMO_FARM } from '../store/farm';
import type { CropId, MarketPrices, SourceRef } from '../types';

const H = texts.home;
const L = H.liveCard;
const PERIOD_MONTH = L.periodMonth;

// ── Живой расчёт демо-хозяйства ─────────────────────────────────────────────
interface LiveCalc {
  /** Эффект изменения цены солярки за месяц на всё хозяйство, ₽ (знак: + улучшило) */
  dieselEffect: number;
  wheatPrice: number | null;
  dieselPrice: number;
  seasonProfit: number;
  date: string;
  sources: SourceRef[];
}
type LiveState = { status: 'loading' } | { status: 'error' } | { status: 'ok'; calc: LiveCalc };


async function computeLive(): Promise<LiveCalc> {
  const region = DEMO_FARM.region;
  const diesel = await loadSeries({ indicator: 'diesel_price', region, frequency: 'week' });
  const perCrop = await Promise.all(
    DEMO_FARM.crops.map(async (plan) => {
      const [price, yld] = await Promise.all([
        loadSeries({ indicator: 'producer_price', region, crop: plan.crop, frequency: 'month' }),
        loadSeries({ indicator: 'yield', region, crop: plan.crop, frequency: 'year' }),
      ]);
      return { plan, data: { price, diesel, yield: yld } };
    }),
  );
  const last = numberAt(diesel);
  if (!last) throw new Error('нет данных по солярке');
  const date = last.date;
  // База «за месяц» — тот же день месяц назад (единое правило методики)
  const before = monthAgo(date);

  let dieselEffect = 0;
  const prices: Partial<Record<CropId, MarketPrices>> = {};
  for (const { plan, data } of perCrop) {
    const base = periodStateAt(plan, data, before);
    const cur = periodStateAt(plan, data, date);
    const fa = factorAnalysis(base, cur, plan.areaHa, plan.crop);
    dieselEffect += fa.contributions.find((c) => c.factor === 'diesel')?.effectTotal ?? 0;
    prices[plan.crop] = { pricePerT: cur.pricePerT, dieselPerL: cur.dieselPerL };
  }
  const econ = computeFarmEconomics(DEMO_FARM, prices);
  const wheat = perCrop.find((c) => c.plan.crop === 'wheat');
  return {
    dieselEffect,
    wheatPrice: wheat ? (numberAt(wheat.data.price, date)?.value ?? null) : null,
    dieselPrice: last.value,
    seasonProfit: econ.profit,
    date,
    sources: [diesel, ...perCrop.map((c) => c.data.price)].map(sourceOf),
  };
}

function useLiveCalc(): LiveState {
  const [state, setState] = useState<LiveState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    computeLive()
      .then((calc) => alive && setState({ status: 'ok', calc }))
      .catch(() => alive && setState({ status: 'error' }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

// ── Карточка ────────────────────────────────────────────────────────────────
/** «Попробовать снова» — перемонтирование карточки: загрузчик не кэширует ошибки, ряды запросятся заново */
function LiveCard() {
  const [attempt, setAttempt] = useState(0);
  return <LiveCardInner key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function LiveCardInner({ onRetry }: { onRetry: () => void }) {
  const state = useLiveCalc();
  const region = REGIONS[DEMO_FARM.region];
  const area = DEMO_FARM.crops.reduce((s, c) => s + c.areaHa, 0);
  const areaStr = formatNumber(area);
  const parts = DEMO_FARM.crops.map((c) => L.cropPart(CROPS[c.crop].name.toLowerCase(), formatNumber(c.areaHa))).join(', ');

  return (
    <article
      aria-live="polite"
      className="paper-ruled relative overflow-hidden rounded-sheet border border-line bg-surface shadow-raise"
    >
      {/* поля журнала */}
      <span aria-hidden className="absolute inset-y-0 left-10 w-px bg-status-worse/25 sm:left-12" />
      <div className="relative py-5 pl-14 pr-5 sm:py-7 sm:pl-[4.25rem] sm:pr-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="kicker">
            {L.kicker}
            {state.status === 'ok' && <span className="num"> · {formatDate(state.calc.date, 'long')}</span>}
          </p>
          <DemoBadge size="sm" />
        </div>

        {state.status === 'loading' && (
          <LoadingState label={texts.common.loading.calc} framed={false} className="mt-5">
            {/* высота как у готовой карточки: число, фраза, три цифры */}
            <Skeleton height={52} width="70%" />
            <Skeleton height={22} />
            <Skeleton height={22} width="80%" />
            <Skeleton height={56} className="mt-6" />
          </LoadingState>
        )}

        {state.status === 'error' && (
          <ErrorState
            className="mt-5"
            message={L.loadFailed}
            onRetry={onRetry}
            action={
              <Button variant="text" size="sm" to={ROUTES.today.path}>
                {ROUTES.today.title}
              </Button>
            }
          />
        )}

        {state.status === 'ok' && <LiveCardBody calc={state.calc} areaStr={areaStr} regionShort={region?.shortName ?? ''} />}

        <p className="mt-5 text-xs leading-relaxed text-muted">
          {L.demoCaption(areaStr, region?.shortName ?? '', parts)}
        </p>
        {state.status === 'ok' && <SourceNote source={state.calc.sources} hideDemoBadge className="mt-2" />}
      </div>
    </article>
  );
}

function LiveCardBody({ calc, areaStr, regionShort }: { calc: LiveCalc; areaStr: string; regionShort: string }) {
  const rounded = Math.round(calc.dieselEffect / 1000) * 1000;
  const loss = rounded <= 0;
  const rub = formatRub(Math.abs(rounded));
  const sentence = loss
    ? L.headline(areaStr, regionShort, rub, PERIOD_MONTH)
    : L.headlineGain(areaStr, regionShort, rub, PERIOD_MONTH);

  const figures: Array<{ label: string; value: string; badge?: 'assumption' }> = [
    ...(calc.wheatPrice != null ? [{ label: L.figures.wheatPrice, value: formatRub(calc.wheatPrice, { unit: '₽/т' }) }] : []),
    { label: L.figures.dieselPrice, value: `${formatNumber(calc.dieselPrice, 2)} ${texts.common.units.rubPerL}` },
    { label: L.figures.seasonProfitShort, value: formatRub(calc.seasonProfit, { compact: true }), badge: 'assumption' },
  ];

  return (
    <>
      <p className="num-display mt-4 text-[40px] font-semibold leading-none text-ink sm:text-[52px]">
        {formatRub(rounded, { sign: true })}
      </p>
      <p className="mt-3 max-w-[34ch] text-[17px] leading-snug text-ink sm:text-lg">{sentence}</p>

      <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-3">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="num whitespace-nowrap text-[17px] font-semibold text-ink">{f.value}</span>
              {f.badge === 'assumption' && <AssumptionBadge size="sm" title={L.figures.seasonProfit} />}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

// ── Страница ────────────────────────────────────────────────────────────────
const BENEFIT_ICONS = [Coins, CalendarRange, SlidersHorizontal];
const BENEFIT_LINKS = [ROUTES.today.path, ROUTES.market.path, ROUTES.whatIf.path];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HomePage() {
  const region = REGIONS[DEMO_FARM.region];
  const phases = region?.season.wheat;
  const today = todayIso();
  const toMarket = { sowing: ROUTES.market.path, growing: ROUTES.market.path, harvest: ROUTES.market.path, sales: ROUTES.market.path };

  return (
    <main>
      {/* Первый экран: высота по содержимому */}
      <section className="mx-auto max-w-page px-4 pb-section pt-page-top sm:px-6 sm:pt-page-top-lg lg:px-8 lg:pb-section-lg">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14">
          <div className="min-w-0 lg:pt-6">
            <p className="kicker">{texts.common.appName} · {region?.name}</p>
            <h1 className="mt-4 text-[26px] font-semibold leading-[1.12] min-[360px]:text-[30px] sm:text-[42px] lg:text-[46px]">{H.hero.title}</h1>
            <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-ink/80">{H.hero.subtitle}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button wrap to={ROUTES.farm.path} iconRight={<ArrowRight size={17} aria-hidden />}>
                {H.hero.cta}
              </Button>
              <Button wrap variant="secondary" to={ROUTES.today.path}>
                {H.hero.ctaSecondary}
              </Button>
            </div>
          </div>
          <LiveCard />
        </div>
      </section>

      {/* Полоса сезона */}
      {phases && (
        <section className="border-y border-line bg-surface/60">
          <div className="mx-auto max-w-page px-4 py-section sm:px-6 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-14">
              <div>
                <h2 className="text-[22px] leading-tight sm:text-[26px]">{H.seasonStrip.title}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/75">{H.seasonStrip.lead}</p>
              </div>
              <SeasonStrip
                phases={phases}
                date={today}
                caption={`${CROPS.wheat.name}, ${region.shortName}`}
                links={toMarket}
              />
            </div>
          </div>
        </section>
      )}

      {/* Три преимущества */}
      <section className="mx-auto max-w-page px-4 py-section sm:px-6 lg:px-8 lg:py-section-lg">
        <h2 className="text-[22px] leading-tight sm:text-[26px]">{H.benefits.title}</h2>
        <ol className="mt-7 grid gap-0 border-t border-line md:grid-cols-3">
          {H.benefits.items.map((b, i) => {
            const Icon = BENEFIT_ICONS[i] ?? Coins;
            return (
              <li
                key={b.title}
                className="border-b border-line py-6 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0"
              >
                <div className="flex items-center gap-3">
                  <span className="num text-sm font-semibold text-ochre">{String(i + 1).padStart(2, '0')}</span>
                  <Icon size={20} strokeWidth={1.75} className="text-accent" aria-hidden />
                </div>
                <h3 className="mt-3 text-lg leading-snug">{b.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink/75">{b.text}</p>
                <Button variant="text" size="sm" to={BENEFIT_LINKS[i]} className="mt-2">
                  {Object.values(ROUTES).find((r) => r.path === BENEFIT_LINKS[i])?.title}
                </Button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Как это работает + финальный призыв */}
      <section className="mx-auto max-w-page px-4 pb-section-lg sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-sheet bg-accent text-accent-ink dark:border dark:border-accent/30 dark:bg-accent-soft dark:text-ink lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="p-card sm:p-section">
            <h2 className="text-[22px] leading-tight sm:text-[28px]">{H.finalCta.title}</h2>
            <p className="mt-3 max-w-[44ch] text-[16px] leading-relaxed opacity-90">{H.finalCta.text}</p>
            <div className="mt-6 flex flex-col gap-x-5 gap-y-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                wrap
                to={ROUTES.farm.path}
                className="!bg-accent-ink !text-accent hover:!opacity-90 dark:!bg-accent dark:!text-accent-ink"
                iconRight={<ArrowRight size={17} aria-hidden />}
              >
                {H.finalCta.button}
              </Button>
              <Button variant="text" to={ROUTES.today.path} className="!text-accent-ink !decoration-accent-ink/50 dark:!text-ink dark:!decoration-ink/40">
                {H.hero.ctaSecondary}
              </Button>
            </div>
          </div>
          <div className="border-t border-accent-ink/15 p-6 dark:border-ink/15 sm:p-10 lg:border-l lg:border-t-0 dark:lg:border-ink/15">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] opacity-80">{H.steps.title}</p>
            <ol className="mt-4 space-y-4">
              {H.steps.items.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full border border-accent-ink/40 text-sm dark:border-ink/30 font-semibold">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-[15px] leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 text-sm opacity-75">{H.steps.note}</p>
          </div>
        </div>
      </section>
    </main>
  );
}

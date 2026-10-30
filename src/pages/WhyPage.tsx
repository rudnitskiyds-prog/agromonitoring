// «Почему изменилась прибыль» — «Из-за чего?» (сценарий С3).
// Два сезона → водопад вкладов (цепные подстановки из src/lib/finance.ts) → drill-down
// «показатель → динамика → регион → фактор». Всё состояние выбора — в query (whyLink).
import { ArrowRight, BookmarkCheck, MousePointerClick, NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AssumptionBadge } from '../components/Badges';
import Button from '../components/Button';
import ChartFrame from '../components/ChartFrame';
import Segmented from '../components/Segmented';
import StatusTag from '../components/StatusTag';
import { EmptyState, ErrorState, LoadingState, Skeleton } from '../components/States';
import { useFarmProfile } from '../components/useFarmProfile';
import { scrollBehavior } from '../components/why/motion';
import Drilldown from '../components/why/Drilldown';
import PeriodPicker from '../components/why/PeriodPicker';
import Waterfall, { FACTOR_NAME, formatMoney, statusOfEffect, type WaterfallMode } from '../components/why/Waterfall';
import { EXAMPLE_AREA_HA, availableYears, buildModel, planFor, pointDates, readSelection, type DrillStep, type WhyModel } from '../components/why/model';

type PointDates = ReturnType<typeof pointDates>;
import { CROPS } from '../config/regions';
import { texts } from '../content/texts';
import { sourceOf } from '../lib/data';
import { formatDate, formatNumber, formatPct, formatRub } from '../lib/format';
import { useSeriesList } from '../hooks/useData';
import { whyLink } from '../routes';
import type { CropId, FactorId, MarketData, RegionId } from '../types';

const W = texts.why;

const WP = W.page;

const FACTOR_FMT: Record<FactorId, (v: number) => string> = {
  price: (v) => formatRub(v, { unit: '₽/т' }),
  yield: (v) => `${formatNumber(v, 1)} ${texts.common.units.chaPerHa}`,
  diesel: (v) => `${formatNumber(v, 2)} ${texts.common.units.rubPerL}`,
  otherCosts: (v) => formatRub(v, { unit: '₽/га' }),
};

const C3 = { region: 'saratov', crop: 'wheat' as CropId, from: 2023, to: 2024 };

export default function WhyPage() {
  // Повтор после ошибки загрузки — перемонтирование по ключу (кэш загрузчика ошибки не хранит)
  const [attempt, setAttempt] = useState(0);
  return <WhyContent key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function WhyContent({ onRetry }: { onRetry: () => void }) {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { profile } = useFarmProfile();
  const sel = readSelection(search, profile);
  const [mode, setMode] = useState<WaterfallMode>('perHa');

  const state = useSeriesList([
    { indicator: 'producer_price', region: sel.region, crop: sel.crop, frequency: 'month' },
    { indicator: 'diesel_price', region: sel.region, frequency: 'week' },
    { indicator: 'yield', region: sel.region, crop: sel.crop, frequency: 'year' },
  ]);
  const data: MarketData | null =
    state.status === 'ready' ? { price: state.data[0], diesel: state.data[1], yield: state.data[2] } : null;
  const result = data ? buildModel(sel, profile, data) : null;
  const model = result?.ok ? result.model : null;
  const years = data ? availableYears(data) : [];
  const { plan, fromProfile } = model ?? (result && !result.ok ? result : planFor(profile, sel.region, sel.crop));

  // Ссылки строим только через whyLink: query — единственный источник состояния
  const go = (
    patch: Partial<{ region: RegionId; crop: CropId; from: number; to: number; factor: FactorId | null; step: DrillStep | null }>,
    replace: boolean,
  ) => {
    const next = {
      region: sel.region,
      crop: sel.crop,
      from: model?.from ?? sel.from ?? undefined,
      to: model?.to ?? sel.to ?? undefined,
      factor: sel.factor ?? undefined,
      step: sel.factor ? sel.step : undefined,
      ...patch,
    };
    navigate(
      whyLink({
        region: next.region,
        crop: next.crop,
        from: next.from ?? undefined,
        to: next.to ?? undefined,
        factor: next.factor ?? undefined,
        step: next.factor ? (next.step ?? 'indicator') : undefined,
      }),
      { replace },
    );
  };

  const selectFactor = (f: FactorId) => {
    go({ factor: f, step: 'indicator' }, false);
    window.setTimeout(() => {
      const el = document.getElementById('why-drilldown');
      el?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      // Фокус — в блок разбора: следующий Tab ведёт по крошкам и шагам
      el?.focus({ preventScroll: true });
    }, 60);
  };

  const isC3 = sel.region === C3.region && sel.crop === C3.crop && model?.from === C3.from && model?.to === C3.to;

  return (
    <main className="mx-auto max-w-page px-4 pb-section-lg pt-page-top sm:px-6 sm:pt-page-top-lg lg:px-8">
      {/* ── Шапка ── */}
      <header className="grid gap-block lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-end lg:gap-section">
        <div>
          <p className="kicker">{W.meta}</p>
          <h1 className="mt-stack text-[28px] font-semibold leading-[1.1] sm:text-[40px]">{W.title}</h1>
          <p className="mt-stack max-w-[52ch] text-[16px] leading-relaxed text-ink/80 sm:text-[17px]">{W.lead}</p>
        </div>
        <C3Card active={isC3} />
      </header>

      {/* ── Что с чем сравниваем ── */}
      <section aria-labelledby="why-periods" className="mt-block-lg border-y border-line py-block">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="why-periods" className="text-lg leading-tight sm:text-xl">
            {W.periods.title}
          </h2>
          <p className="text-xs text-muted">{WP.datesNote}</p>
        </div>
        <div className="mt-stack">
          <PeriodPicker
            region={sel.region}
            crop={sel.crop}
            from={model?.from ?? null}
            to={model?.to ?? null}
            years={years}
            onChange={(p) => go({ ...p, factor: null, step: null }, true)}
          />
        </div>
        <div className="mt-stack flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink/80">
          <NotebookPen size={16} className="text-ochre" aria-hidden />
          {fromProfile ? (
            <span>{WP.ownPlan(CROPS[plan.crop].name.toLowerCase(), formatNumber(plan.areaHa))}</span>
          ) : (
            <span title={WP.examplePlanHint}>{WP.examplePlan(formatNumber(EXAMPLE_AREA_HA))}</span>
          )}
          {(!fromProfile || Object.values(plan.costs).some((c) => c.assumption)) && <AssumptionBadge size="sm" />}
        </div>
        {result && !result.ok && result.reason === 'same' && (
          <p role="alert" className="mt-stack text-sm font-medium text-status-worse">{W.periods.sameError}</p>
        )}
      </section>

      {state.status === 'loading' && (
        <LoadingState label={texts.common.loading.calc} framed={false} className="mt-block-lg">
          <Skeleton height={48} width="40%" />
          <div className="pt-block">
            <Skeleton height={360} className="rounded-card" />
          </div>
        </LoadingState>
      )}
      {state.status === 'error' && (
        <ErrorState className="mt-block-lg" message={texts.common.errors.load} onRetry={onRetry} />
      )}
      {result && !result.ok && (result.reason === 'noYears' || result.reason === 'noAligned') && (
        <EmptyState className="mt-block-lg" message={WP.noYears} />
      )}

      {model && data && (
        <>
          <Summary model={model} mode={mode} showExample={!isC3} />

          <ChartFrame
            as="h2"
            className="mt-block"
            question={W.waterfall.title}
            lead={W.waterfall.lead}
            source={[sourceOf(data.price), sourceOf(data.yield), sourceOf(data.diesel)]}
            sourceNote={WP.sourceNote}
            actions={
              <Segmented<WaterfallMode>
                label={WP.modeLabel}
                size="sm"
                value={mode}
                onSelect={setMode}
                options={[
                  { id: 'perHa', label: W.waterfall.perHa },
                  { id: 'farm', label: W.waterfall.onFarm },
                ]}
              />
            }
          >
            <div className="px-3 pb-2 pt-stack">
              <Waterfall analysis={model.analysis} mode={mode} selected={sel.factor} onSelect={selectFactor} />
              <div className="mt-stack flex flex-col gap-1.5 border-t border-dashed border-line pt-3 text-[13px] text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink/80">
                  <MousePointerClick size={15} className="text-accent" aria-hidden />
                  {W.waterfall.clickHint}
                </span>
                <span>{W.waterfall.order}</span>
              </div>
              <Residual model={model} mode={mode} />
              <YieldPlanNote model={model} />
            </div>
          </ChartFrame>

          <FactorTable
            model={model}
            mode={mode}
            selected={sel.factor}
            onSelect={selectFactor}
            dates={{ from: pointDates(data, model.dates.from), to: pointDates(data, model.dates.to) }}
            dieselRussia={data.diesel.region === 'russia'}
          />

          <div className="mt-section">
            {sel.factor ? (
              <Drilldown
                region={sel.region}
                crop={sel.crop}
                factor={sel.factor}
                step={sel.step}
                analysis={model.analysis}
                from={model.from}
                to={model.to}
                fromDate={model.dates.from}
                toDate={model.dates.to}
                onStep={(s) => go({ step: s }, false)}
                own={model.fromProfile}
              />
            ) : (
              <PickFactor model={model} onSelect={selectFactor} />
            )}
          </div>
        </>
      )}
    </main>
  );
}

// ── Закладка «С3» ───────────────────────────────────────────────────────────
function C3Card({ active }: { active: boolean }) {
  return (
    <aside className="paper-ruled relative overflow-hidden rounded-sheet border border-line bg-surface shadow-raise">
      <span aria-hidden className="absolute inset-y-0 left-9 w-px bg-status-worse/25" />
      {/* «закладка» сверху */}
      <span aria-hidden className="absolute right-6 top-0 h-7 w-4 bg-ochre [clip-path:polygon(0_0,100%_0,100%_100%,50%_75%,0_100%)]" />
      <div className="relative py-card pl-14 pr-card">
        <p className="kicker">{WP.c3Kicker}</p>
        <p className="mt-2 text-[17px] font-semibold leading-snug text-ink">{WP.c3Title}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink/75">{WP.c3Text}</p>
        <div className="mt-stack">
          {active ? (
            <span className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-accent">
              <BookmarkCheck size={16} aria-hidden />
              {WP.c3Active}
            </span>
          ) : (
            <Button size="sm" wrap to={whyLink(C3)} iconRight={<ArrowRight size={15} aria-hidden />}>
              {WP.c3Button}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

// ── Итог ────────────────────────────────────────────────────────────────────
function Summary({ model, mode, showExample }: { model: WhyModel; mode: WaterfallMode; showExample: boolean }) {
  const a = model.analysis;
  const total = mode === 'perHa' ? a.totalChangePerHa : a.totalChange;
  const biggest = [...a.contributions].sort((x, y) => Math.abs(y.effectPerHa) - Math.abs(x.effectPerHa))[0];
  const status = statusOfEffect(a.totalChangePerHa);
  return (
    <section aria-label={WP.totalLabel} className="mt-block-lg grid gap-gutter-lg sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end sm:gap-block-lg">
      <div>
        <p className="text-sm text-muted">
          {WP.totalLabel} · {a.base.label} → {a.current.label}
        </p>
        <p className="num-display mt-2 text-[36px] font-semibold leading-none sm:text-[48px]">{formatMoney(total, mode, true)}</p>
      </div>
      <div className="max-w-prose space-y-1.5 pb-1 text-[15px] leading-snug text-ink/85">
        <StatusTag status={status} />
        <p>{W.waterfall.summary(formatMoney(total, mode, true), a.base.label)}.</p>
        {biggest && Math.abs(biggest.effectPerHa) > 0.5 && (
          <p>{W.waterfall.biggest(FACTOR_NAME[biggest.factor], formatMoney(mode === 'perHa' ? biggest.effectPerHa : biggest.effectTotal, mode, true))}.</p>
        )}
        {showExample && a.totalChangePerHa > 0 && (
          <Button variant="text" size="sm" wrap to={whyLink(C3)} iconRight={<ArrowRight size={14} aria-hidden />} className="!h-auto text-left">
            {WP.c3Title}
          </Button>
        )}
      </div>
    </section>
  );
}

/** Итогов урожайности за год нет — в расчёте план; при «план против плана» вклад урожайности 0. */
function YieldPlanNote({ model }: { model: WhyModel }) {
  const years = [model.yieldPlan.from ? model.from : null, model.yieldPlan.to ? model.to : null].filter((y): y is number => y !== null);
  if (!years.length) return null;
  return (
    <ul className="mt-stack space-y-1">
      {years.map((y) => (
        <li key={y} className="flex flex-wrap items-center gap-2 text-[13px] text-ink/80">
          <AssumptionBadge size="sm" />
          <span>{texts.common.labels.yieldPlanFallback(String(y))}</span>
        </li>
      ))}
    </ul>
  );
}

function Residual({ model, mode }: { model: WhyModel; mode: WaterfallMode }) {
  const a = model.analysis;
  const k = mode === 'perHa' ? 1 : a.areaHa;
  const sum = a.contributions.reduce((s, c) => s + c.effectPerHa, 0) * k;
  const total = a.totalChangePerHa * k;
  const residual = Math.abs(a.residualPerHa * k) < 0.5 ? 0 : a.residualPerHa * k;
  const fmt = (v: number, sign = true) => (mode === 'perHa' ? formatRub(v, { unit: '₽/га', sign }) : formatRub(v, { sign }));
  return (
    <p className="num mt-2 text-[13px] text-muted">
      {WP.residual(fmt(sum), fmt(total), fmt(residual, false))}
    </p>
  );
}

// ── Таблица вкладов (журнальная запись) ──────────────────────────────────────
function FactorTable({
  model,
  mode,
  selected,
  onSelect,
  dates,
  dieselRussia,
}: {
  model: WhyModel;
  mode: WaterfallMode;
  selected: FactorId | null;
  onSelect: (f: FactorId) => void;
  /** Фактические даты точек цены и солярки в каждом сезоне */
  dates: { from: PointDates; to: PointDates };
  dieselRussia: boolean;
}) {
  const a = model.analysis;
  // Дата точки под значением: цена — месяц Росстата, солярка — неделя
  const dateOf = (f: FactorId, side: 'from' | 'to'): string | null => {
    const d = f === 'price' ? dates[side].price : f === 'diesel' ? dates[side].diesel : null;
    if (!d) return null;
    return f === 'price' ? formatDate(d, 'month') : formatDate(d, 'long');
  };
  const sub = (f: FactorId) =>
    f === 'diesel' && dieselRussia ? <span className="block text-[12px] font-normal text-muted">{texts.common.labels.dieselRussia}</span> : null;
  return (
    <section aria-labelledby="why-table" className="mt-section">
      <h2 id="why-table" className="text-lg leading-tight sm:text-xl">
        {WP.tableTitle}
      </h2>
      <div className="num mt-stack hidden border-y border-line text-sm sm:block">
        <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)] gap-4 border-b border-line py-2 text-xs text-muted">
          <span>{WP.colFactor}</span>
          <span className="text-right">{a.base.label}</span>
          <span className="text-right">{a.current.label}</span>
          <span className="text-right">{WP.colChange}</span>
          <span className="text-right">{WP.colEffect}</span>
        </div>
        <ul className="divide-y divide-line">
          {a.contributions.map((c) => {
            const on = c.factor === selected;
            const eff = mode === 'perHa' ? c.effectPerHa : c.effectTotal;
            return (
              <li key={c.factor}>
                <button
                  type="button"
                  onClick={() => onSelect(c.factor)}
                  aria-pressed={on}
                  className={`grid w-full grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)] items-center gap-4 py-3 text-left transition-colors hover:bg-surface-2/50 ${
                    on ? 'bg-accent-soft/40' : ''
                  }`}
                >
                  <span className={`pl-2 font-medium ${on ? 'text-accent' : 'text-ink'}`}>
                    {FACTOR_NAME[c.factor]}
                    {sub(c.factor)}
                  </span>
                  {(['from', 'to'] as const).map((side) => (
                    <span key={side} className="text-right text-ink/80">
                      {FACTOR_FMT[c.factor](side === 'from' ? c.from : c.to)}
                      {dateOf(c.factor, side) && <span className="block text-[11.5px] text-muted">{dateOf(c.factor, side)}</span>}
                      {c.factor === 'yield' && model.yieldPlan[side] && (
                        <span className="block text-[11.5px] text-ochre">{texts.common.labels.yieldPlanFallbackShort}</span>
                      )}
                    </span>
                  ))}
                  <span className="text-right">{c.changePct === null ? '—' : formatPct(c.changePct)}</span>
                  <span className="flex items-center justify-end gap-2 pr-2">
                    <span className="font-semibold">{formatMoney(eff, mode, true)}</span>
                    <StatusTag status={statusOfEffect(c.effectPerHa)} size="sm" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {/* телефон — карточки */}
      <ul className="num mt-stack space-y-2 sm:hidden">
        {a.contributions.map((c) => {
          const on = c.factor === selected;
          const eff = mode === 'perHa' ? c.effectPerHa : c.effectTotal;
          return (
            <li key={c.factor}>
              <button
                type="button"
                onClick={() => onSelect(c.factor)}
                aria-pressed={on}
                className={`w-full rounded-card border p-card-sm text-left ${on ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {FACTOR_NAME[c.factor]}
                    {sub(c.factor)}
                  </span>
                  <StatusTag status={statusOfEffect(c.effectPerHa)} size="sm" />
                </span>
                <span className="mt-1 block text-[13px] text-ink/75">
                  {FACTOR_FMT[c.factor](c.from)}
                  {c.factor === 'yield' && model.yieldPlan.from && ` (${texts.common.labels.yieldPlanFallbackShort})`} →{' '}
                  {FACTOR_FMT[c.factor](c.to)}
                  {c.factor === 'yield' && model.yieldPlan.to && ` (${texts.common.labels.yieldPlanFallbackShort})`}
                  {c.changePct !== null && <> ({formatPct(c.changePct)})</>}
                </span>
                {dateOf(c.factor, 'from') && (
                  <span className="mt-0.5 block text-[11.5px] text-muted">
                    {dateOf(c.factor, 'from')} → {dateOf(c.factor, 'to')}
                  </span>
                )}
                <span className="mt-1 block text-[15px] font-semibold">{formatMoney(eff, mode, true)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PickFactor({ model, onSelect }: { model: WhyModel; onSelect: (f: FactorId) => void }) {
  return (
    <section aria-labelledby="why-pick" className="rounded-sheet border border-dashed border-line-strong p-card sm:p-card-lg">
      <p className="kicker">{W.drilldown.title}</p>
      <h2 id="why-pick" className="mt-1.5 text-lg leading-tight sm:text-xl">
        {WP.pickTitle}
      </h2>
      <p className="mt-1.5 text-[15px] text-ink/75">{W.drilldown.pickHint}</p>
      <div className="mt-stack flex flex-wrap gap-2">
        {model.analysis.contributions.map((c) => (
          <Button key={c.factor} variant="secondary" size="sm" onClick={() => onSelect(c.factor)}>
            {FACTOR_NAME[c.factor]}
          </Button>
        ))}
      </div>
    </section>
  );
}

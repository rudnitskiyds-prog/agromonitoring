// «Что если»: ползунки цены, урожайности и солярки ±30% → мгновенный пересчёт прибыли,
// торнадо чувствительности, безубыточные цена и урожайность (финал сценария С2).
import { RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AnimatedNumber from '../components/AnimatedNumber';
import { AssumptionBadge, DemoBadge } from '../components/Badges';
import Button from '../components/Button';
import Segmented from '../components/Segmented';
import SourceNote from '../components/SourceNote';
import StatusTag from '../components/StatusTag';
import TornadoChart from '../components/TornadoChart';
import FarmHeader from '../components/today/FarmHeader';
import { useFarmMarket } from '../components/today/farmModel';
import { useFarmProfile } from '../components/useFarmProfile';
import ShiftSlider from '../components/whatif/ShiftSlider';
import { CROPS } from '../config/regions';
import { methodology } from '../content/methodology';
import { texts } from '../content/texts';
import { applyWhatIfFarm, breakevenCushion, NO_SHIFT, sensitivity } from '../lib/finance';
import { formatNumber, formatPct, formatRub } from '../lib/format';
import { readParams, ROUTES } from '../routes';
import type { CropEconomics, CropId, WhatIfShifts } from '../types';

const W = texts.whatIf;
const C = texts.common;
const RANGE = 0.3;
const FACTOR_NAME: Record<'price' | 'yield' | 'diesel', string> = {
  price: W.sliders.price.label,
  yield: W.sliders.yield.label,
  diesel: W.sliders.diesel.label,
};

const clampPct = (v: number | null) => (v === null ? 0 : Math.max(-30, Math.min(30, Math.round(v))));
const TOKEN = '\u0000';

export default function WhatIfPage() {
  const { profile } = useFarmProfile();
  const params = readParams(useLocation().search);
  const cropParam = params.get('crop') as CropId | null;
  const paramCrop = cropParam && profile.crops.some((c) => c.crop === cropParam) ? cropParam : null;
  const fromMarketPct = params.num('pricePct');

  const [shifts, setShifts] = useState(() => ({
    price: clampPct(params.num('pricePct')),
    yield: clampPct(params.num('yieldPct')),
    diesel: clampPct(params.num('dieselPct')),
  }));
  const [scope, setScope] = useState<'crop' | 'all'>(paramCrop ? 'crop' : 'all');
  const only = scope === 'crop' ? paramCrop : null;

  const { status, market } = useFarmMarket(profile);
  const prices = market?.prices ?? null;
  const shiftFr: WhatIfShifts = { price: shifts.price / 100, yield: shifts.yield / 100, diesel: shifts.diesel / 100 };

  const base = useMemo(() => (prices ? applyWhatIfFarm(profile, prices, NO_SHIFT) : null), [profile, prices]);
  const scen = prices ? applyWhatIfFarm(profile, prices, shiftFr, { only: only ?? undefined }) : null;
  const tornado = useMemo(() => (prices ? sensitivity(profile, prices, RANGE) : []), [profile, prices]);

  const diff = scen && base ? scen.profit - base.profit : 0;
  const zero = shifts.price === 0 && shifts.yield === 0 && shifts.diesel === 0;
  const focusCrop = only ?? [...profile.crops].sort((a, b) => b.areaHa - a.areaHa)[0]?.crop ?? null;
  const baseCrop = base?.crops.find((c) => c.crop === focusCrop);
  const scenCrop = scen?.crops.find((c) => c.crop === focusCrop);
  const hasAssumptions = profile.crops.some((c) => c.yieldCha.assumption || Object.values(c.costs).some((v) => v.assumption));
  const [vbBefore, vbAfter] = W.result.versusBase(TOKEN).split(TOKEN);
  const set = (k: keyof typeof shifts) => (v: number) => setShifts((s) => ({ ...s, [k]: v }));
  const tornadoNote = methodology.sections.find((x) => x.id === 'whatIf')?.paragraphs?.[0];

  return (
    <main className="mx-auto max-w-page px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <FarmHeader profile={profile} />
      <h1 className="mt-4 text-[30px] leading-[1.1] sm:text-[40px]">{ROUTES.whatIf.title}</h1>
      <p className="mt-2 text-[16px] text-ink/75">{W.lead}</p>

      {status === 'loading' && <p className="mt-10 text-muted">{C.loading.calc}</p>}
      {status === 'error' && (
        <div className="mt-10 max-w-prose rounded-card border border-line bg-surface p-5">
          <p className="font-semibold">{C.errors.loadTitle}</p>
          <p className="mt-1 text-sm text-ink/80">{C.errors.load}</p>
        </div>
      )}

      {market && base && scen && (
        <>
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-10">
            {/* Ползунки */}
            <section aria-label={W.title} className="rounded-sheet border border-line bg-surface p-5 sm:p-6 lg:sticky lg:top-6 lg:self-start">
              <h2 className="text-lg leading-tight">{W.title}</h2>
              {paramCrop && profile.crops.length > 1 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-muted">{W.cropLabel}</p>
                  <Segmented
                    size="sm"
                    label={W.cropLabel}
                    value={scope}
                    onSelect={setScope}
                    options={[
                      { id: 'crop', label: W.scopeCrop(CROPS[paramCrop].name) },
                      { id: 'all', label: W.scopeAll },
                    ]}
                  />
                </div>
              )}
              {paramCrop && profile.crops.length === 1 && (
                <p className="mt-2 text-sm text-muted">
                  {W.cropLabel}: {CROPS[paramCrop].name}
                </p>
              )}
              {fromMarketPct !== null && <p className="mt-3 rounded-control bg-ochre-soft px-3 py-2 text-sm">{W.fromMarket(formatPct(fromMarketPct))}</p>}

              <div className="mt-6 space-y-6">
                <ShiftSlider
                  label={W.sliders.price.label}
                  hint={W.sliders.price.hint}
                  value={shifts.price}
                  onChange={set('price')}
                  valueNote={
                    baseCrop && scenCrop && focusCrop
                      ? `${CROPS[focusCrop].name}: ${formatRub(baseCrop.pricePerT, { unit: '₽/т' })} → ${formatRub(scenCrop.pricePerT, { unit: '₽/т' })}`
                      : undefined
                  }
                />
                <ShiftSlider
                  label={W.sliders.yield.label}
                  hint={W.sliders.yield.hint}
                  value={shifts.yield}
                  onChange={set('yield')}
                  valueNote={
                    baseCrop && scenCrop
                      ? `${formatNumber(baseCrop.yieldTPerHa * 10, 1)} → ${formatNumber(scenCrop.yieldTPerHa * 10, 1)} ${C.units.chaPerHa}`
                      : undefined
                  }
                />
                <ShiftSlider
                  label={W.sliders.diesel.label}
                  hint={W.sliders.diesel.hint}
                  value={shifts.diesel}
                  onChange={set('diesel')}
                  valueNote={
                    baseCrop && scenCrop
                      ? `${formatNumber(baseCrop.dieselPerL, 2)} → ${formatNumber(scenCrop.dieselPerL, 2)} ${C.units.rubPerL}`
                      : undefined
                  }
                />
              </div>
              <Button
                variant="text"
                size="sm"
                className="mt-4"
                disabled={zero}
                onClick={() => setShifts({ price: 0, yield: 0, diesel: 0 })}
                iconLeft={<RotateCcw size={14} aria-hidden />}
              >
                {W.sliders.reset}
              </Button>
            </section>

            {/* Телефон: итог прилипает снизу, пока двигаешь ползунки */}
          <div className="sticky bottom-0 z-20 -mx-4 border-y border-line bg-surface/95 px-4 py-3 shadow-pop backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
            <div className="mx-auto flex max-w-page items-baseline justify-between gap-3">
              <span className="text-xs text-muted">{W.result.profit}</span>
              <span className="num text-right">
                <AnimatedNumber value={scen.profit} format={(v) => formatRub(v, { compact: true })} className="block text-[18px] font-semibold" />
                <AnimatedNumber
                  value={diff}
                  format={(v) => formatRub(Math.round(v), { sign: true, compact: true })}
                  className={`block text-xs ${diff > 0 ? 'text-status-better' : diff < 0 ? 'text-status-worse' : 'text-muted'}`}
                />
              </span>
            </div>
          </div>

            {/* Результат */}
            <div className="min-w-0 space-y-6">
              <section className="rounded-sheet border border-line bg-surface p-5 sm:p-7" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg leading-tight sm:text-xl">{W.result.title}</h2>
                  {hasAssumptions && <AssumptionBadge size="sm" />}
                </div>
                <p className="mt-4 text-sm text-muted">{W.result.profit}</p>
                <AnimatedNumber
                  value={scen.profit}
                  format={(v) => formatRub(v)}
                  className="num-display mt-1 block text-[34px] font-semibold leading-none sm:text-[48px]"
                />
                <p className="num mt-3 text-[16px]">
                  {vbBefore}
                  <AnimatedNumber
                    value={diff}
                    format={(v) => formatRub(Math.round(v), { sign: true })}
                    className={`font-semibold ${diff > 0 ? 'text-status-better' : diff < 0 ? 'text-status-worse' : 'text-ink'}`}
                  />
                  {vbAfter}
                </p>
                <div className="mt-3">
                  {zero ? (
                    <p className="text-sm text-muted">{W.result.same}</p>
                  ) : scen.profit < 0 ? (
                    <StatusTag status="worse" label={W.result.loss} />
                  ) : diff > 0 ? (
                    <StatusTag status="better" label={W.result.gain} />
                  ) : diff < 0 ? (
                    <StatusTag status="worse" label={C.status.worse} />
                  ) : null}
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">{W.result.baseLabel}</dt>
                    <dd className="num mt-1 text-[17px] font-semibold">{formatRub(base.profit, { compact: true })}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{W.result.scenarioLabel}</dt>
                    <dd className="num mt-1 text-[17px] font-semibold">
                      <AnimatedNumber value={scen.profit} format={(v) => formatRub(v, { compact: true })} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{W.result.profitPerHa}</dt>
                    <dd className="num mt-1 text-[17px] font-semibold">
                      <AnimatedNumber value={scen.marginPerHa} format={(v) => formatRub(v, { unit: '₽/га' })} />
                    </dd>
                  </div>
                </dl>
                <SourceNote source={market.sources.all} note={W.assumptionNote} className="mt-5 border-t border-line pt-3" />
              </section>

              {/* Торнадо */}
              <section className="rounded-sheet border border-line bg-surface p-5 sm:p-7">
                <h2 className="text-lg leading-tight sm:text-xl">{W.tornado.title}</h2>
                <p className="mt-1.5 text-[15px] text-ink/75">{W.tornado.lead(formatPct(RANGE * 100, { sign: false, fractionDigits: 0 }))}</p>
                {tornado[0] && (
                  <p className="mt-2 text-sm font-semibold">{W.tornado.mostSensitive(FACTOR_NAME[tornado[0].factor])}</p>
                )}
                <TornadoChart
                  className="mt-5"
                  base={base.profit}
                  baseLabel={`${W.result.baseLabel}: ${formatRub(base.profit, { compact: true })}`}
                  lowLegend={W.tornado.low}
                  highLegend={W.tornado.high}
                  format={(v) => formatRub(v, { compact: true })}
                  rows={tornado.map((b) => {
                    const dieselRow = b.factor === 'diesel';
                    const lowV = Math.min(b.lowProfit, b.highProfit);
                    const highV = Math.max(b.lowProfit, b.highProfit);
                    const minus = formatPct(-RANGE * 100, { fractionDigits: 0 });
                    const plus = formatPct(RANGE * 100, { fractionDigits: 0 });
                    return {
                      id: b.factor,
                      label: FACTOR_NAME[b.factor],
                      low: lowV,
                      high: highV,
                      lowCaption: dieselRow ? plus : minus,
                      highCaption: dieselRow ? minus : plus,
                      ariaLabel: W.tornado.barLabel(FACTOR_NAME[b.factor], formatRub(lowV), formatRub(highV)),
                    };
                  })}
                />
                {tornadoNote && <p className="mt-4 text-xs leading-relaxed text-muted">{tornadoNote}</p>}
                <SourceNote source={market.sources.all} className="mt-4" />
              </section>

              {/* Безубыточность */}
              <section>
                <h2 className="text-lg leading-tight sm:text-xl">{W.breakeven.title}</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {scen.crops.map((c) => (
                    <BreakevenCard key={c.crop} econ={c} />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {market.sources.all.some((s) => s.demo) && <DemoBadge size="sm" />}
                  {hasAssumptions && <AssumptionBadge size="sm" />}
                </div>
              </section>
            </div>
          </div>

        </>
      )}
    </main>
  );
}

function BreakevenCard({ econ }: { econ: CropEconomics }) {
  const crop = CROPS[econ.crop];
  const yieldCha = econ.yieldTPerHa * 10;
  const { pricePct: priceCushion, yieldPct: yieldCushion } = breakevenCushion(econ);
  const cushion = (pct: number | null, tpl: (s: string) => string) =>
    pct === null ? null : pct < 0 ? (
      <StatusTag status="worse" label={W.breakeven.belowAlready} size="sm" />
    ) : (
      <span className="num text-sm text-ink/80">{tpl(formatPct(pct, { sign: false, fractionDigits: 0 }))}</span>
    );
  return (
    <article className="relative overflow-hidden rounded-card border border-line bg-surface p-5 pl-6">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: `rgb(var(${crop.colorVar}))` }} />
      <h3 className="text-base">{crop.name}</h3>
      <dl className="mt-3 space-y-4">
        <div>
          <dt className="text-xs text-muted" title={W.breakeven.priceHint}>
            {W.breakeven.price}
          </dt>
          <dd className="mt-1">
            <span className="num-display block text-[22px] font-semibold">
              {econ.breakevenPricePerT === null ? '—' : formatRub(econ.breakevenPricePerT, { unit: '₽/т' })}
            </span>
            <span className="num block text-xs text-muted">
              {W.breakeven.priceNow(formatRub(econ.pricePerT, { unit: '₽/т' }))}
            </span>
            <span className="mt-1 block">{cushion(priceCushion, W.breakeven.cushionPrice)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted" title={W.breakeven.yieldHint}>
            {W.breakeven.yield}
          </dt>
          <dd className="mt-1">
            <span className="num-display block text-[22px] font-semibold">
              {econ.breakevenYieldCha === null ? '—' : `${formatNumber(econ.breakevenYieldCha, 1)} ${C.units.chaPerHa}`}
            </span>
            <span className="num block text-xs text-muted">
              {W.breakeven.yieldNow(`${formatNumber(yieldCha, 1)}\u00a0${C.units.chaPerHa}`)}
            </span>
            <span className="mt-1 block">{cushion(yieldCushion, W.breakeven.cushionYield)}</span>
          </dd>
        </div>
      </dl>
    </article>
  );
}

// «Моё хозяйство»: онбординг в 3 шага. Значения по умолчанию — допущения (бейдж), правятся.
import { ArrowLeft, ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import NumberField from '../components/NumberField';
import { useFarmProfile } from '../components/useFarmProfile';
import { CROPS, REGIONS } from '../config/regions';
import { texts } from '../content/texts';
import { nonFuelCostPerHa } from '../lib/finance';
import { formatNumber, formatRub } from '../lib/format';
import { ROUTES } from '../routes';
import { DEMO_FARM, buildDefaultPlan, clearFarmProfile, defaultCosts, defaultYieldCha, saveFarmProfile } from '../store/farm';
import type { CostsPerHa, CropId, CropPlan, FarmProfile, RegionId } from '../types';

const F = texts.farm;
const V = F.validation;
const CROP_ORDER: CropId[] = ['wheat', 'barley', 'sunflower', 'corn'];
const COST_KEYS: Array<keyof CostsPerHa> = ['seeds', 'fertilizers', 'plantProtection', 'fuelLitersPerHa', 'other'];
const STEPS = 3;

// ── Черновик формы ──────────────────────────────────────────────────────────
/** Поле черновика: null — пусто, NaN — не число. assumption — значение по умолчанию, не тронуто. */
interface Num {
  value: number | null;
  assumption: boolean;
}
interface DraftCrop {
  crop: CropId;
  areaHa: number | null;
  yieldCha: Num;
  costs: Record<keyof CostsPerHa, Num>;
}
interface Draft {
  name: string;
  region: RegionId;
  selected: CropId[];
  /** Планы всех когда-либо отмеченных культур: снятая галочка не стирает введённое */
  plans: Partial<Record<CropId, DraftCrop>>;
}

function fromPlan(p: CropPlan): DraftCrop {
  const costs = {} as Record<keyof CostsPerHa, Num>;
  for (const k of COST_KEYS) costs[k] = { ...p.costs[k] };
  return { crop: p.crop, areaHa: p.areaHa, yieldCha: { ...p.yieldCha }, costs };
}

function freshCrop(region: RegionId, crop: CropId): DraftCrop {
  return { ...fromPlan(buildDefaultPlan(region, crop, 0)), areaHa: null };
}

function initialDraft(profile: FarmProfile, saved: boolean): Draft {
  if (saved) {
    const plans: Draft['plans'] = {};
    for (const c of profile.crops) plans[c.crop] = fromPlan(c);
    return { name: profile.name, region: profile.region, selected: profile.crops.map((c) => c.crop), plans };
  }
  const region = REGIONS.krasnodar ? 'krasnodar' : Object.keys(REGIONS)[0];
  return { name: '', region, selected: ['wheat'], plans: { wheat: freshCrop(region, 'wheat') } };
}

/** Смена региона: всё, что ещё допущение, берём из нового региона; введённое пользователем — не трогаем. */
function rebaseRegion(d: Draft, region: RegionId): Draft {
  const plans: Draft['plans'] = {};
  for (const [crop, p] of Object.entries(d.plans) as Array<[CropId, DraftCrop]>) {
    const def = defaultCosts(region, crop);
    const costs = { ...p.costs };
    for (const k of COST_KEYS) if (costs[k].assumption) costs[k] = { ...def[k] };
    plans[crop] = {
      ...p,
      yieldCha: p.yieldCha.assumption ? { value: defaultYieldCha(region, crop), assumption: true } : p.yieldCha,
      costs,
    };
  }
  const allowed = REGIONS[region]?.crops ?? CROP_ORDER;
  return { ...d, region, plans, selected: d.selected.filter((c) => allowed.includes(c)) };
}

// ── Проверка ────────────────────────────────────────────────────────────────
type Errors = Record<string, string>;
const LIMITS = { area: 1_000_000, yield: 300, money: 10_000_000, fuel: 2_000 };

function checkNum(v: number | null, opts: { positive?: string; max: number }): string | null {
  if (v === null) return V.required;
  if (Number.isNaN(v)) return V.notNumber;
  if (v < 0) return V.negative;
  if (opts.positive && v <= 0) return opts.positive;
  if (v > opts.max) return V.tooBig;
  return null;
}

function validate(d: Draft, step: number): Errors {
  const e: Errors = {};
  if (step === 1 && d.selected.length === 0) e.crops = F.step1.cropsError;
  for (const crop of d.selected) {
    const p = d.plans[crop];
    if (!p) continue;
    if (step === 2) {
      const a = checkNum(p.areaHa, { positive: V.areaPositive, max: LIMITS.area });
      if (a) e[`${crop}.area`] = a;
      const y = checkNum(p.yieldCha.value, { positive: V.yieldPositive, max: LIMITS.yield });
      if (y) e[`${crop}.yield`] = y;
    }
    if (step === 3) {
      for (const k of COST_KEYS) {
        const m = checkNum(p.costs[k].value, { max: k === 'fuelLitersPerHa' ? LIMITS.fuel : LIMITS.money });
        if (m) e[`${crop}.${k}`] = m;
      }
    }
  }
  return e;
}

function toProfile(d: Draft): FarmProfile {
  const crops: CropPlan[] = d.selected.map((crop) => {
    const p = d.plans[crop]!;
    const costs = {} as CostsPerHa;
    for (const k of COST_KEYS) costs[k] = { value: p.costs[k].value ?? 0, assumption: p.costs[k].assumption };
    return { crop, areaHa: p.areaHa ?? 0, yieldCha: { value: p.yieldCha.value ?? 0, assumption: p.yieldCha.assumption }, costs };
  });
  return {
    version: 1,
    name: d.name.trim() || ROUTES.farm.title,
    region: d.region,
    crops,
    isDemo: false,
    updatedAt: new Date().toISOString(),
  };
}

// ── Страница ────────────────────────────────────────────────────────────────
export default function FarmPage() {
  const { profile, origin } = useFarmProfile();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(profile, origin === 'saved'));
  const [step, setStep] = useState(1);
  const [tried, setTried] = useState<Record<number, boolean>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [storageFailed, setStorageFailed] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const errors = useMemo(() => validate(draft, step), [draft, step]);
  const visibleError = (key: string) => (tried[step] || touched[key] ? (errors[key] ?? null) : null);
  const region = REGIONS[draft.region];
  const totalArea = draft.selected.reduce((s, c) => s + (Number.isFinite(draft.plans[c]?.areaHa ?? NaN) ? draft.plans[c]!.areaHa! : 0), 0);

  const updatePlan = (crop: CropId, fn: (p: DraftCrop) => DraftCrop) =>
    setDraft((d) => ({ ...d, plans: { ...d.plans, [crop]: fn(d.plans[crop] ?? freshCrop(d.region, crop)) } }));

  const toggleCrop = (crop: CropId) =>
    setDraft((d) => {
      const on = d.selected.includes(crop);
      const selected = on ? d.selected.filter((c) => c !== crop) : CROP_ORDER.filter((c) => c === crop || d.selected.includes(c));
      const plans = d.plans[crop] ? d.plans : { ...d.plans, [crop]: freshCrop(d.region, crop) };
      return { ...d, selected, plans };
    });

  const goTo = (n: number) => {
    setStep(n);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const next = () => {
    if (Object.keys(errors).length) {
      setTried((t) => ({ ...t, [step]: true }));
      // После отрисовки ошибок — к первому полю с ошибкой (или к выбору культур на шаге 1)
      setTimeout(() => {
        const form = formRef.current;
        const el =
          form?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
          form?.querySelector<HTMLElement>('input[type="checkbox"]:not(:disabled)');
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        el?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    if (step < STEPS) return goTo(step + 1);
    const ok = saveFarmProfile(toProfile(draft));
    if (ok) navigate(ROUTES.today.path);
    else setStorageFailed(true);
  };

  const resetToDemo = () => {
    if (!window.confirm(F.resetConfirm)) return;
    clearFarmProfile();
    // Форма заполняется демо-хозяйством: 800 га пшеницы + 400 га подсолнечника, Краснодар
    setDraft({ ...initialDraft(DEMO_FARM, true), name: '' });
    setTried({});
    setTouched({});
    setStorageFailed(false);
    goTo(1);
  };

  const stepTitle = [F.step1.title, F.step2.title, F.step3.title][step - 1];

  return (
    <main className="mx-auto max-w-page px-4 pb-section-lg pt-page-top sm:px-6 sm:pt-page-top-lg lg:px-8">
      <div ref={topRef} className="scroll-mt-4" />
      <header className="max-w-3xl">
        <p className="kicker">{F.title}</p>
        <h1 className="mt-3 text-[30px] leading-[1.1] sm:text-[40px]">{ROUTES.farm.title}</h1>
        <p className="mt-3 max-w-prose text-[16px] leading-relaxed text-ink/80">{F.lead}</p>
      </header>

      {/* Прогресс */}
      <nav aria-label={F.progress(String(step), String(STEPS))} className="mt-block-lg">
        <p className="num text-sm font-semibold text-ink">{F.progress(String(step), String(STEPS))}</p>
        <ol className="mt-3 grid grid-cols-3 gap-2">
          {F.stepNames.map((name, i) => {
            const n = i + 1;
            const done = n < step;
            const current = n === step;
            return (
              <li key={name} className="min-w-0">
                <button
                  type="button"
                  disabled={n > step}
                  onClick={() => goTo(n)}
                  aria-current={current ? 'step' : undefined}
                  className="group block w-full text-left disabled:cursor-default"
                >
                  <span
                    className={`block h-1.5 rounded-full ${current ? 'bg-accent' : done ? 'bg-accent/50' : 'bg-line'}`}
                    aria-hidden
                  />
                  <span
                    className={`mt-2 flex items-start gap-1.5 text-xs leading-snug sm:text-sm ${
                      current ? 'font-semibold text-ink' : done ? 'text-ink/75 group-hover:text-accent' : 'text-muted'
                    }`}
                  >
                    {done && <Check size={14} className="mt-0.5 hidden shrink-0 text-accent sm:block" aria-hidden />}
                    {name}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-block-lg grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
        <form
          ref={formRef}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          className="min-w-0"
        >
          <h2 className="text-[22px] leading-tight sm:text-[26px]">{stepTitle}</h2>

          {step === 1 && (
            <div className="mt-6 space-y-8">
              <TextField label={F.name.label} hint={F.name.hint} placeholder={F.name.placeholder} value={draft.name} onChange={(name) => setDraft((d) => ({ ...d, name }))} />

              <fieldset>
                <legend className="text-sm font-medium">{F.step1.regionLabel}</legend>
                <p className="mt-0.5 text-xs text-muted">{F.step1.regionHint}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {Object.values(REGIONS).map((r) => {
                    const on = r.id === draft.region;
                    return (
                      <label
                        key={r.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-card border px-4 py-3.5 transition-colors ${
                          on ? 'border-accent bg-accent-soft/60' : 'border-line-strong bg-surface hover:border-accent'
                        }`}
                      >
                        <input
                          type="radio"
                          name="region"
                          value={r.id}
                          checked={on}
                          onChange={() => setDraft((d) => rebaseRegion(d, r.id))}
                          className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold">{r.name}</span>
                          <span className="block text-xs text-muted">{r.shortName}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium">{F.step1.cropsLabel}</legend>
                <p className="mt-0.5 text-xs text-muted">{F.step1.cropsHint}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CROP_ORDER.map((crop) => {
                    const available = region?.crops.includes(crop) ?? true;
                    const on = draft.selected.includes(crop);
                    return (
                      <label
                        key={crop}
                        className={`flex items-center gap-3 rounded-card border px-4 py-3.5 transition-colors ${
                          !available
                            ? 'cursor-not-allowed border-line opacity-60'
                            : on
                              ? 'cursor-pointer border-accent bg-accent-soft/60'
                              : 'cursor-pointer border-line-strong bg-surface hover:border-accent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!available}
                          onChange={() => toggleCrop(crop)}
                          className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
                        />
                        <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: `rgb(var(${CROPS[crop].colorVar}))` }} />
                        <span className="min-w-0">
                          <span className="block font-semibold">{CROPS[crop].name}</span>
                          {!available && <span className="block text-xs text-muted">{F.step1.cropNotInRegion}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {tried[1] && errors.crops && <FieldError text={errors.crops} />}
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-4">
              {draft.selected.map((crop) => {
                const p = draft.plans[crop]!;
                return (
                  <CropBlock key={crop} crop={crop} title={F.step2.forCrop(CROPS[crop].name)}>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <NumberField
                        label={F.step2.areaLabel}
                        unit={F.step2.areaUnit}
                        value={p.areaHa}
                        hint={F.step2.areaHint}
                        error={visibleError(`${crop}.area`)}
                        onChange={(v) => {
                          setTouched((t) => ({ ...t, [`${crop}.area`]: true }));
                          updatePlan(crop, (x) => ({ ...x, areaHa: v }));
                        }}
                      />
                      <NumberField
                        label={F.step2.yieldLabel}
                        unit={F.step2.yieldUnit}
                        value={p.yieldCha.value}
                        hint={F.step2.yieldHint}
                        assumption={p.yieldCha.assumption}
                        error={visibleError(`${crop}.yield`)}
                        resetLabel={F.step3.resetToDefault}
                        onReset={() =>
                          updatePlan(crop, (x) => ({ ...x, yieldCha: { value: defaultYieldCha(draft.region, crop), assumption: true } }))
                        }
                        onChange={(v) => {
                          setTouched((t) => ({ ...t, [`${crop}.yield`]: true }));
                          updatePlan(crop, (x) => ({ ...x, yieldCha: { value: v, assumption: false } }));
                        }}
                      />
                    </div>
                  </CropBlock>
                );
              })}
              <p className="num pt-1 text-[15px] font-semibold">{F.step2.totalArea(formatNumber(totalArea))}</p>
            </div>
          )}

          {step === 3 && (
            <div className="mt-3 space-y-4">
              <p className="max-w-prose text-[15px] leading-relaxed text-ink/80">{F.step3.lead}</p>
              {draft.selected.map((crop) => {
                const p = draft.plans[crop]!;
                const def = defaultCosts(draft.region, crop);
                return (
                  <CropBlock key={crop} crop={crop} title={F.step3.forCrop(CROPS[crop].name)}>
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {COST_KEYS.map((k) => {
                        const fd = F.step3.fields[k];
                        const key = `${crop}.${k}`;
                        return (
                          <NumberField
                            key={k}
                            label={fd.label}
                            unit={fd.unit}
                            value={p.costs[k].value}
                            hint={fd.hint}
                            assumption={p.costs[k].assumption}
                            error={visibleError(key)}
                            resetLabel={F.step3.resetToDefault}
                            onReset={() => updatePlan(crop, (x) => ({ ...x, costs: { ...x.costs, [k]: { ...def[k] } } }))}
                            onChange={(v) => {
                              setTouched((t) => ({ ...t, [key]: true }));
                              updatePlan(crop, (x) => ({ ...x, costs: { ...x.costs, [k]: { value: v, assumption: false } } }));
                            }}
                          />
                        );
                      })}
                    </div>
                  </CropBlock>
                );
              })}
            </div>
          )}

          {/* Ошибки шага и навигация */}
          {tried[step] && Object.keys(errors).length > 0 && <FieldError text={V.fixErrors} className="mt-6" />}

          {storageFailed && (
            <div role="alert" className="mt-6 rounded-card border border-status-normal/50 bg-status-normal-bg p-4">
              <p className="flex items-center gap-2 font-semibold text-status-normal">
                <TriangleAlert size={17} aria-hidden />
                {texts.common.errors.storageTitle}
              </p>
              <p className="mt-1 text-sm text-ink/85">{texts.common.errors.storage}</p>
              <Button to={ROUTES.today.path} size="sm" className="mt-3" iconRight={<ArrowRight size={15} aria-hidden />}>
                {F.finish}
              </Button>
            </div>
          )}

          <div className="mt-block-lg flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {step > 1 && (
                <Button variant="secondary" onClick={() => goTo(step - 1)} iconLeft={<ArrowLeft size={17} aria-hidden />} className="w-full sm:w-auto">
                  {texts.common.actions.back}
                </Button>
              )}
            </div>
            <Button type="submit" iconRight={<ArrowRight size={17} aria-hidden />} className="w-full sm:w-auto">
              {step < STEPS ? texts.common.actions.next : F.saveAndView}
            </Button>
          </div>
          <p className="mt-4 text-sm">
            <Link to={ROUTES.today.path} className="link">
              {F.skip}
            </Link>
            <span className="mt-0.5 block text-xs text-muted">{F.skipHint}</span>
          </p>
        </form>

        {/* Сводка хозяйства */}
        <aside className="lg:pt-1">
          <div className="rounded-card border border-line border-t-4 border-t-accent bg-surface p-5 lg:sticky lg:top-6">
            <p className="kicker">{texts.common.farmChip.label}</p>
            <p className="mt-2 text-lg font-semibold leading-snug">{draft.name.trim() || ROUTES.farm.title}</p>
            <p className="text-sm text-muted">{region?.name}</p>
            <ul className="mt-4 space-y-2.5">
              {draft.selected.map((crop) => {
                const p = draft.plans[crop];
                const area = p?.areaHa;
                const costsOk = p && COST_KEYS.every((k) => Number.isFinite(p.costs[k].value ?? NaN));
                return (
                  <li key={crop} className="flex items-start gap-2.5 text-sm">
                    <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `rgb(var(${CROPS[crop].colorVar}))` }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2">
                        <span>{CROPS[crop].name}</span>
                        <span className="num font-semibold">
                          {area != null && Number.isFinite(area) ? `${formatNumber(area)} ${F.step2.areaUnit}` : '—'}
                        </span>
                      </span>
                      {step === 3 && costsOk && (
                        <span className="num block text-xs text-muted">
                          {F.summary.nonFuelCost(
                            formatRub(nonFuelCostPerHa(toProfile({ ...draft, selected: [crop] }).crops[0].costs), { unit: '₽/га' }),
                          )}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="num mt-4 border-t border-line pt-3 text-sm font-semibold">{F.step2.totalArea(formatNumber(totalArea))}</p>
            <p className="mt-4 text-xs leading-relaxed text-muted">{F.savedLocalOnly}</p>
            {origin === 'saved' && (
              <Button variant="text" size="sm" onClick={resetToDemo} className="mt-2">
                {F.resetToDemo}
              </Button>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

// ── Мелкие части ────────────────────────────────────────────────────────────
function CropBlock({ crop, title, children }: { crop: CropId; title: string; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-card border border-line bg-surface p-4 pl-5 sm:p-6 sm:pl-7">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: `rgb(var(${CROPS[crop].colorVar}))` }} />
      <h3 className="text-base">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FieldError({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p role="alert" className={`mt-3 flex items-start gap-1.5 text-sm font-medium text-status-worse ${className}`}>
      <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

function TextField({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block max-w-md">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="organization"
        className="mt-1.5 h-12 w-full rounded-control border border-line-strong bg-surface px-3 text-[17px] outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

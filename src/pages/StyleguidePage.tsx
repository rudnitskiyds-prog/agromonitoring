// Витрина дизайн-системы (/#/styleguide). Все цифры здесь — локальные образцы для показа
// компонентов, помечены бейджем «Демо-данные»; это не статистика и не расчёт.
import { ArrowRight, Calculator } from 'lucide-react';
import { useMemo, useState } from 'react';
import AssumptionBadge from '../components/AssumptionBadge';
import Button from '../components/Button';
import ChartFrame from '../components/ChartFrame';
import DemoBadge from '../components/DemoBadge';
import FactorCard from '../components/FactorCard';
import KpiCard from '../components/KpiCard';
import LineChart, { type ChartSeries } from '../components/LineChart';
import SeasonStrip, { PHASE_LABEL } from '../components/SeasonStrip';
import SourceNote from '../components/SourceNote';
import StatusTag from '../components/StatusTag';
import { texts } from '../content/texts';
import { formatNumber, formatPct, formatRub } from '../lib/format';
import { ROUTES } from '../routes';
import type { DataPoint, SeasonPhase, SeasonPhaseId, SourceRef } from '../types';

const T = texts.styleguide;
const S = T.sections;

// ── Локальные образцы (не статистика) ──────────────────────────────────────
const SAMPLE_SOURCE: SourceRef = {
  source: 'Образец для витрины', // TODO(copywriter): подпись источника образцов
  source_url: '',
  updated_at: '2026-10-26',
  demo: true,
};
const SAMPLE_DATE = '2026-10-28';
const SAMPLE_PHASES: SeasonPhase[] = [
  { id: 'sowing', from: '09-20', to: '10-31' },
  { id: 'growing', from: '11-01', to: '06-25' },
  { id: 'harvest', from: '06-26', to: '07-31' },
  { id: 'sales', from: '08-01', to: '09-19' },
];

/** Гладкий синтетический ряд: уровень + сезонная волна + тренд. Только для показа графика. */
function sampleSeries(base: number, amp: number, phase: number, trend: number): DataPoint[] {
  return Array.from({ length: 24 }, (_, i) => {
    const y = 2024 + Math.floor((10 + i) / 12);
    const m = ((10 + i) % 12) + 1;
    const v = base + amp * Math.sin(((m + phase) / 12) * 2 * Math.PI) + trend * i;
    return { date: `${y}-${String(m).padStart(2, '0')}-01`, value: Math.round(v / 10) * 10 };
  });
}

// ── Палитра ────────────────────────────────────────────────────────────────
const SWATCHES: Array<{ group: string; note?: string; items: Array<{ token: string; name: string; fg?: string }> }> = [
  {
    group: 'Поверхности и текст', // TODO(copywriter)
    items: [
      { token: 'bg', name: 'Лён — фон' },
      { token: 'surface', name: 'Лист журнала' },
      { token: 'surface-2', name: 'Вдавленная область' },
      { token: 'line', name: 'Линовка' },
      { token: 'muted', name: 'Почвенный серый' },
      { token: 'ink', name: 'Текст' },
    ],
  },
  {
    group: 'Акценты', // TODO(copywriter)
    items: [
      { token: 'accent', name: 'Зелёный поля' },
      { token: 'accent-soft', name: 'Зелёный, фон' },
      { token: 'ochre', name: 'Пшеничная охра' },
      { token: 'ochre-soft', name: 'Охра, фон' },
    ],
  },
  {
    group: 'Культуры — цвет серии', // TODO(copywriter)
    note: 'Закреплён за культурой на всех графиках.', // TODO(copywriter)
    items: [
      { token: 'crop-wheat', name: 'Пшеница' },
      { token: 'crop-barley', name: 'Ячмень' },
      { token: 'crop-sunflower', name: 'Подсолнечник' },
      { token: 'crop-corn', name: 'Кукуруза' },
    ],
  },
  {
    group: 'Сигналы', // TODO(copywriter)
    note: texts.common.status.legend,
    items: [
      { token: 'status-worse', name: texts.common.status.worse },
      { token: 'status-normal', name: texts.common.status.normal },
      { token: 'status-better', name: texts.common.status.better },
    ],
  },
];

function Palette({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme} className="rounded-sheet border border-line bg-bg p-4 text-ink sm:p-6">
      <p className="kicker">{theme === 'light' ? texts.common.theme.light : texts.common.theme.dark}</p>
      <div className="mt-4 space-y-5">
        {SWATCHES.map((g) => (
          <div key={g.group}>
            <p className="text-sm font-semibold">{g.group}</p>
            {g.note && <p className="mt-0.5 text-xs text-muted">{g.note}</p>}
            <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.items.map((it) => (
                <li key={it.token} className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-9 w-9 shrink-0 rounded-control border border-ink/10"
                    style={{ background: `rgb(var(--${it.token}))` }}
                    aria-hidden
                  />
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[13px]">{it.name}</span>
                    <code className="block truncate text-[11px] text-muted">--{it.token}</code>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Каркас раздела ─────────────────────────────────────────────────────────
const SECTIONS = [
  ['colors', S.colors],
  ['typography', S.typography],
  ['numbers', S.numbers],
  ['buttons', S.buttons],
  ['badges', `${S.badges} и ${S.statuses.toLowerCase()}`],
  ['factors', S.factorCards],
  ['kpi', S.kpi],
  ['charts', S.charts],
  ['season', S.seasonStrip],
] as const;

function Section({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={`sg-${id}`} className="scroll-mt-6 border-t border-line pt-8 sm:pt-10">
      <div className="mb-5 flex items-baseline gap-3 sm:mb-6">
        <span className="num text-sm font-semibold text-ochre">{String(n).padStart(2, '0')}</span>
        <h2 className="text-xl leading-tight sm:text-2xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  const [phase, setPhase] = useState<SeasonPhaseId | undefined>(undefined);

  const chartSeries = useMemo<ChartSeries[]>(
    () => [
      { id: 'wheat', label: 'Пшеница', colorVar: '--crop-wheat', points: sampleSeries(14800, 1300, 3, 40) },
      { id: 'barley', label: 'Ячмень', colorVar: '--crop-barley', points: sampleSeries(12900, 1000, 3.4, 25) },
      { id: 'corn', label: 'Кукуруза', colorVar: '--crop-corn', points: sampleSeries(11600, 900, 5, 55) },
    ],
    [],
  );

  return (
    <main className="mx-auto max-w-page px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <header className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <p className="kicker">{T.meta}</p>
          <DemoBadge size="sm" title="Все цифры на этой странице — образцы для показа компонентов, не статистика." />
          {/* TODO(copywriter): подсказка бейджа витрины */}
        </div>
        <h1 className="mt-3 text-[28px] leading-[1.1] sm:text-[40px]">{T.title}</h1>
        <p className="mt-3 max-w-prose text-[16px] leading-relaxed text-ink/80">{T.lead}</p>
      </header>

      <div className="mt-10 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-12">
        {/* Оглавление журнала */}
        <nav aria-label="Разделы витрины" className="hidden lg:block">
          <ol className="sticky top-6 space-y-2 border-l border-line pl-4 text-sm">
            {SECTIONS.map(([id, title], i) => (
              <li key={id}>
                <a href={`#/styleguide`} onClick={(e) => { e.preventDefault(); document.getElementById(`sg-${id}`)?.scrollIntoView(); }} className="flex gap-2 text-muted hover:text-ink">
                  <span className="num w-5 text-ochre">{String(i + 1).padStart(2, '0')}</span>
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-12">
          <Section id="colors" n={1} title={S.colors}>
            <div className="grid gap-4 md:grid-cols-2">
              <Palette theme="light" />
              <Palette theme="dark" />
            </div>
          </Section>

          <Section id="typography" n={2} title={S.typography}>
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                <div>
                  <p className="kicker mb-1.5">H1 · Unbounded 600</p>
                  <p className="font-display text-[26px] font-semibold leading-[1.12] sm:text-[36px]">{texts.home.hero.title}</p>
                </div>
                <div>
                  <p className="kicker mb-1.5">H2 · Unbounded 500</p>
                  <p className="font-display text-xl sm:text-2xl">{ROUTES.market.question}</p>
                </div>
                <div>
                  <p className="kicker mb-1.5">H3 · Golos Text 600</p>
                  <p className="text-lg font-semibold">{texts.factors.heading}</p>
                </div>
                <div>
                  <p className="kicker mb-1.5">Текст · Golos Text 400</p>
                  <p className="max-w-prose text-[16px] leading-relaxed text-ink/85">{texts.home.hero.subtitle}</p>
                </div>
              </div>
              <div className="rounded-card border border-line bg-surface p-5">
                <p className="kicker">Крупная цифра · Unbounded</p>
                <p className="num-display mt-2 text-[40px] font-semibold leading-none">{formatRub(-742000)}</p>
                <p className="mt-2 text-sm text-muted">Табличные цифры · tabular-nums</p>
                <table className="num mt-3 w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {[
                      ['Выручка', 16_480_000],
                      ['Затраты', -11_115_400],
                      ['Прибыль', 5_364_600],
                    ].map(([k, v]) => (
                      <tr key={k as string}>
                        <td className="py-1.5 text-ink/80">{k}</td>
                        <td className="py-1.5 text-right font-medium">{formatRub(v as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <DemoBadge size="sm" className="mt-3" />
              </div>
            </div>
          </Section>

          <Section id="numbers" n={3} title={S.numbers}>
            <dl className="num grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['formatNumber(1234567.8, 1)', formatNumber(1234567.8, 1)],
                ['formatRub(-1850, ₽/га)', formatRub(-1850, { unit: '₽/га' })],
                ['formatRub(742000, sign)', formatRub(742000, { sign: true })],
                ['formatRub(5364600, compact)', formatRub(5364600, { compact: true })],
                ['formatPct(4)', formatPct(4)],
                ['formatPct(−3,24)', formatPct(-3.24)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b border-dashed border-line pb-2">
                  <dt className="truncate text-xs text-muted">{k}</dt>
                  <dd className="whitespace-nowrap font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-sm text-muted">Единицы поля:</p>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {[
                texts.common.units.chaPerHa,
                texts.common.units.rubPerT,
                texts.common.units.rubPerHa,
                texts.common.units.lPerHa,
                texts.common.units.rubPerL,
                texts.common.units.mm,
                texts.common.units.activeTempSum,
              ].map((u) => (
                <li key={u} className="rounded-tag border border-line bg-surface px-2 py-1">
                  {u}
                </li>
              ))}
            </ul>
          </Section>

          <Section id="buttons" n={4} title={S.buttons}>
            <div className="flex flex-wrap items-center gap-3">
              <Button to={ROUTES.farm.path} iconRight={<ArrowRight size={17} aria-hidden />}>
                {texts.home.hero.cta}
              </Button>
              <Button variant="secondary" to={ROUTES.today.path}>
                {texts.home.hero.ctaSecondary}
              </Button>
              <Button variant="text" to={ROUTES.sources.path}>
                {texts.common.actions.toSources}
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button size="sm" iconLeft={<Calculator size={15} aria-hidden />}>
                {texts.common.actions.apply}
              </Button>
              <Button size="sm" variant="secondary">
                {texts.common.actions.reset}
              </Button>
              <Button size="sm" disabled>
                {texts.common.actions.save}
              </Button>
            </div>
          </Section>

          <Section id="badges" n={5} title={`${S.badges} и ${S.statuses.toLowerCase()}`}>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <DemoBadge />
                  <AssumptionBadge />
                  <DemoBadge size="sm" />
                  <AssumptionBadge size="sm" />
                </div>
                <div className="rounded-card border border-line bg-surface p-4">
                  <SourceNote
                    source={{ source: 'Росстат / ЕМИСС', source_url: 'https://fedstat.ru', updated_at: '2026-10-01', demo: true }}
                  />
                  <SourceNote
                    className="mt-2"
                    source={{ source: 'Open-Meteo, CC BY 4.0', source_url: 'https://open-meteo.com', updated_at: SAMPLE_DATE, demo: false }}
                  />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag status="worse" />
                  <StatusTag status="normal" />
                  <StatusTag status="better" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag status="better" label="Окно для продаж" size="sm" />
                  {/* TODO(copywriter): пример подписи статуса */}
                  <StatusTag status="worse" label="Заморозок" size="sm" />
                  <StatusTag status="normal" plain />
                </div>
                <p className="text-xs text-muted">{texts.common.status.legend}</p>
              </div>
            </div>
          </Section>

          <Section id="factors" n={6} title={S.factorCards}>
            <p className="-mt-2 mb-5 max-w-prose text-sm text-muted">{texts.today.factorsLead}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FactorCard
                kind="price"
                title={`${texts.factors.price.name}: пшеница`}
                status="worse"
                effectRub={-1230}
                changePct={-3}
                changeCaption="за месяц"
                valueText="14 350 ₽/т"
                link={ROUTES.market.path}
                source={SAMPLE_SOURCE}
              />
              <FactorCard
                kind="diesel"
                title={texts.factors.diesel.name}
                status="worse"
                effectRub={-620}
                changePct={4}
                changeCaption="за месяц"
                valueText="68,9 ₽/л"
                link={ROUTES.market.path}
                source={SAMPLE_SOURCE}
              />
              <FactorCard
                kind="yield"
                title={texts.factors.yield.name}
                status="better"
                effectRub={2140}
                changePct={5.2}
                changeCaption="к плану"
                valueText="58,4 ц/га"
                link={ROUTES.harvest.path}
                source={SAMPLE_SOURCE}
              />
              <FactorCard
                kind="weather"
                title={texts.factors.weather.name}
                status="normal"
                effectRub={null}
                headline={texts.factors.weather.noRub}
                changePct={null}
                changeCaption="осадки около нормы"
                link={ROUTES.harvest.path}
                source={SAMPLE_SOURCE}
              />
            </div>
          </Section>

          <Section id="kpi" n={7} title={S.kpi}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
              <KpiCard
                size="lg"
                label="Прибыль с гектара пшеницы за октябрь"
                value={formatRub(-1850, { unit: '₽/га', sign: true })}
                status="worse"
                hint="солярка −620 ₽/га, цена −1 230 ₽/га"
                source={SAMPLE_SOURCE}
                className="paper-ruled"
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard label="Себестоимость тонны" value={formatRub(11950, { unit: '₽/т' })} hint="при 58,4 ц/га" />
                <KpiCard
                  label="Безубыточная урожайность"
                  value={`${formatNumber(41.3, 1)} ц/га`}
                  badge={<AssumptionBadge size="sm" />}
                />
                <KpiCard label="Доля топлива в затратах" value={formatPct(14.2, { sign: false })} hint="70 л/га" />
              </div>
            </div>
          </Section>

          <Section id="charts" n={8} title={S.charts}>
            <ChartFrame
              as="h3"
              question={ROUTES.market.question}
              lead="Образец: три культуры за 24 месяца, одна ось Y, подпись у линии, последняя точка выделена."
              unit={`Цена производителей, ${texts.common.units.rubPerT}`}
              source={SAMPLE_SOURCE}
              sourceNote="Синтетический ряд для витрины"
            >
              <LineChart series={chartSeries} frequency="month" height={300} ariaLabel="Образец графика цен" />
            </ChartFrame>
          </Section>

          <Section id="season" n={9} title={S.seasonStrip}>
            <div className="rounded-sheet border border-line bg-surface p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[15px] font-semibold">{texts.home.seasonStrip.title}</p>
                <p className="text-sm text-muted">
                  {phase ? texts.seasonStrip.phaseHint[phase] : texts.home.seasonStrip.lead}
                </p>
              </div>
              <SeasonStrip
                phases={SAMPLE_PHASES}
                date={SAMPLE_DATE}
                caption="Пшеница озимая · образец календаря"
                activePhase={phase}
                onSelect={setPhase}
              />
              {phase && (
                <p className="mt-4 text-sm">
                  {texts.seasonStrip.ariaLabel(PHASE_LABEL[phase])}.{' '}
                  <Button variant="text" size="sm" to={ROUTES.market.path}>
                    {texts.seasonStrip.goToMarket}
                  </Button>
                </p>
              )}
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

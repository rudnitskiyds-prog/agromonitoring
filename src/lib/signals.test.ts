import { describe, expect, it } from 'vitest';
import type { DailyWeather, PeriodState, SignalContext } from '../types';
import { ROUTES } from '../routes';
import { DEMO_FARM } from '../store/farm';
import { factorAnalysis } from './finance';
import { buildSignals, detectWeatherRisks, formatDayRange, pickAdvice, WEATHER_WORSE_PRIORITY } from './signals';

const p = (s: string) => s.replace(/ /g, ' ');

const day = (date: string, tMin: number | null, tMax: number | null, precipitation: number | null = 5): DailyWeather => ({
  date,
  tMin,
  tMax,
  tMean: tMin !== null && tMax !== null ? (tMin + tMax) / 2 : null,
  precipitation,
});

describe('detectWeatherRisks', () => {
  it('сливает подряд идущие дни заморозка в один период', () => {
    const r = detectWeatherRisks([
      day('2026-11-03', 2, 10),
      day('2026-11-04', -1, 8),
      day('2026-11-05', -3, 6),
      day('2026-11-06', 1, 9),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'frost', from: '2026-11-04', to: '2026-11-05' });
    expect(p(r[0].text)).toBe('Заморозок до −3 °C 4–5 ноября');
  });
  it('разрыв в днях — два периода; порог 0 °C включительно', () => {
    const r = detectWeatherRisks([day('2026-04-10', 0, 10), day('2026-04-12', -2, 10)]);
    expect(r.map((x) => x.from)).toEqual(['2026-04-10', '2026-04-12']);
    expect(r[0].status).toBe('worse'); // апрель — вегетация
    expect(p(r[0].text)).toBe('Заморозок до 0 °C 10 апреля');
  });
  it('жара > 35 °C, на стыке месяцев', () => {
    const r = detectWeatherRisks([day('2026-07-30', 20, 36), day('2026-07-31', 22, 37.4), day('2026-08-01', 22, 35), day('2026-08-02', 22, 35.5)]);
    expect(r).toHaveLength(2);
    expect(p(r[0].text)).toBe('Жара до +37 °C 30–31 июля');
    expect(r[0].status).toBe('worse');
    expect(p(formatDayRange('2026-10-30', '2026-11-02'))).toBe('30 октября – 2 ноября');
  });
  it('сухой период — от 10 дней подряд с осадками < 1 мм', () => {
    const days9 = Array.from({ length: 9 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 15, 30, 0.2));
    expect(detectWeatherRisks(days9)).toEqual([]);
    const days12 = Array.from({ length: 12 }, (_, i) => day(`2026-06-${String(i + 1).padStart(2, '0')}`, 15, 30, 0));
    const r = detectWeatherRisks(days12);
    expect(r).toHaveLength(1);
    expect(p(r[0].text)).toBe('Без дождей 12 дней подряд: 1–12 июня');
    expect(r[0].status).toBe('worse');
  });
  it('пропуски данных не считаются риском', () => {
    expect(detectWeatherRisks([day('2026-11-01', null, null, null)])).toEqual([]);
  });
});

const wheat = DEMO_FARM.crops[0];
const sun = DEMO_FARM.crops[1];
const st = (pricePerT: number, dieselPerL: number, yieldCha: number, fuel: number): PeriodState => ({
  label: '',
  pricePerT,
  yieldCha,
  dieselPerL,
  fuelLitersPerHa: fuel,
  nonFuelCostPerHa: 20000,
});

const src = { source: 'Росстат', source_url: '', updated_at: '2026-10-01', demo: true };

function ctx(extra: Partial<SignalContext> = {}): SignalContext {
  return {
    profile: DEMO_FARM,
    analyses: [
      // Пшеница: 50 ц/га, цена −3% (15 000 → 14 550) — −2 250 ₽/га; солярка +4% (70 → 72,8)
      factorAnalysis(st(15000, 70, 50, 60), st(14550, 72.8, 50, 60), wheat.areaHa, 'wheat'),
      factorAnalysis(st(38000, 70, 25, 60), st(38000, 72.8, 25, 60), sun.areaHa, 'sunflower'),
    ],
    sources: { price: src, diesel: src, seasonality: src, weather: src },
    ...extra,
  };
}

describe('buildSignals', () => {
  it('цена и солярка языком фермера, сортировка по приоритету', () => {
    const s = buildSignals(ctx());
    const price = s.find((x) => x.id === 'price-wheat')!;
    expect(p(price.text)).toBe('Пшеница подешевела на 3% — −2 250 ₽ с гектара');
    expect(price.status).toBe('worse');
    expect(price.effectRub).toBeCloseTo(-2250, 6);
    expect(price.effectUnit).toBe('₽/га');
    expect(price.link).toBe(ROUTES.market.path);
    expect(p(price.title)).toBe('Пшеница −3%');

    const diesel = s.find((x) => x.kind === 'diesel')!;
    expect(diesel.effectRub).toBeCloseTo(-168, 6);
    expect(p(diesel.text)).toBe('Солярка подорожала на 4% — это −168 ₽ с гектара (−202 тыс. ₽ на хозяйство)');
    expect(diesel.status).toBe('worse');

    // подсолнечник: цена не менялась → normal
    expect(s.find((x) => x.id === 'price-sunflower')!.status).toBe('normal');
    // урожайность не менялась → сигнала нет
    expect(s.some((x) => x.kind === 'yield')).toBe(false);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].priority).toBeGreaterThanOrEqual(s[i].priority);
    expect(s[0].id).toBe('price-wheat');
  });

  it('урожайность меняется → сигнал', () => {
    const c = ctx();
    c.analyses = [factorAnalysis(st(15000, 70, 50, 60), st(15000, 70, 41, 60), 800, 'wheat')];
    const y = buildSignals(c).find((x) => x.kind === 'yield')!;
    expect(p(y.text)).toBe('Урожайность пшеницы снизилась на 18% — −13 500 ₽ с гектара');
    expect(y.link).toBe(ROUTES.harvest.path);
  });

  it('сезонность: окно для продажи', () => {
    const s = buildSignals(
      ctx({ seasonality: [{ date: '2026-10-01', month: 10, currentPrice: 15900, normPrice: 15000, deviationPct: 6, status: 'better' }] }),
    );
    const sea = s.find((x) => x.kind === 'seasonality')!;
    expect(p(sea.text)).toBe('Пшеница: цена на 6% выше обычной для октября — хорошее окно для продажи (+4 950 ₽ с гектара к обычной цене)');
    expect(sea.effectRub).toBeCloseTo(900 * 5.5, 6);
    expect(sea.status).toBe('better');
  });

  it('погодный риск worse — наверху, effectRub null', () => {
    const risks = detectWeatherRisks([day('2026-05-04', -2, 12)]);
    const s = buildSignals(ctx({ weatherRisks: risks }));
    expect(s[0].kind).toBe('weather');
    expect(s[0].priority).toBe(WEATHER_WORSE_PRIORITY);
    expect(s[0].effectRub).toBeNull();
    expect(s[0].effectUnit).toBeNull();
    expect(s[0].link).toBe(ROUTES.harvest.path);
  });
});

describe('pickAdvice', () => {
  it('самый важный сигнал с действием', () => {
    const a = pickAdvice(buildSignals(ctx()))!;
    expect(a.id).toBe('advice-price-wheat');
    expect(p(a.text)).toContain('Сравните цену с сезонной нормой');
  });
  it('нечего сказать — null', () => {
    const c = ctx();
    c.analyses = [factorAnalysis(st(15000, 70, 50, 60), st(15000, 70, 50, 60), 800, 'wheat')];
    expect(pickAdvice(buildSignals(c))).toBeNull();
    expect(pickAdvice([])).toBeNull();
  });
});

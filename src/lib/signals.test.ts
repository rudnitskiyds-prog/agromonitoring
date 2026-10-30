import { describe, expect, it } from 'vitest';
import type { DailyWeather, PeriodState, SignalContext } from '../types';
import { ROUTES } from '../routes';
import { DEMO_FARM } from '../store/farm';
import { factorAnalysis } from './finance';
import { buildRegionalProfile, seasonalDeviation } from './seasonality';
import type { DataSeries } from '../types';
import { buildSignals, cropShortName, CROP_SHORT, detectWeatherRisks, formatDayRange, pickAdvice, RISK_SEASON_MONTHS, WEATHER_WORSE_PRIORITY } from './signals';

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
  it('сезон риска апрель–сентябрь: 28 октября −1 °C → normal, 15 сентября → worse', () => {
    expect(RISK_SEASON_MONTHS).toEqual({ from: 4, to: 9 });
    expect(detectWeatherRisks([day('2026-10-28', -1, 8)])[0].status).toBe('normal');
    expect(detectWeatherRisks([day('2026-09-15', -1, 12)])[0].status).toBe('worse');
    expect(detectWeatherRisks([day('2026-03-20', -2, 8)])[0].status).toBe('normal');
    const dryOct = Array.from({ length: 10 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, '0')}`, 5, 15, 0));
    expect(detectWeatherRisks(dryOct)[0].status).toBe('normal');
    expect(detectWeatherRisks([day('2026-10-28', 20, 36)])[0].status).toBe('worse'); // жара — всегда
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

  it('сезонность сопоставляется по crop, а не по порядку', () => {
    const s = buildSignals(
      ctx({
        seasonality: [
          { crop: 'sunflower', date: '2026-10-01', month: 10, currentPrice: 34200, normPrice: 38000, deviationPct: -10, status: 'worse' },
          { crop: 'wheat', date: '2026-10-01', month: 10, currentPrice: 15900, normPrice: 15000, deviationPct: 6, status: 'better' },
        ],
      }),
    );
    const sun = s.find((x) => x.id === 'seasonality-sunflower')!;
    const wh = s.find((x) => x.id === 'seasonality-wheat')!;
    expect(p(sun.text)).toMatch(/^Подсолнечник: цена на 10% ниже обычной для октября/);
    expect(sun.effectRub).toBeCloseTo(-3800 * 2.6, 6); // урожайность подсолнечника 26 ц/га
    expect(p(wh.text)).toMatch(/^Пшеница: цена на 6% выше/);
    expect(wh.effectRub).toBeCloseTo(900 * 5.5, 6);
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

describe('cropShortName', () => {
  it('короткие имена', () => {
    expect(cropShortName('corn')).toBe('Кукуруза');
    expect(CROP_SHORT.wheat).toBe('Пшеница');
  });
});

describe('сигнал сезонности с региональным профилем (форма — Россия)', () => {
  const IDX = [1.04, 1.05, 1.06, 1.05, 1.02, 0.98, 0.92, 0.9, 0.95, 1.0, 1.01, 1.02];
  const mk = (region: string, from: number, to: number, level: (y: number) => number, lastMonth = 12): DataSeries => {
    const series = [];
    for (let y = from; y <= to; y++)
      for (let m = 1; m <= (y === to ? lastMonth : 12); m++)
        series.push({ date: `${y}-${String(m).padStart(2, '0')}-01`, value: level(y) * IDX[m - 1] });
    return {
      indicator: 'producer_price', region, crop: 'sunflower', unit: 'руб./т', source: 'Росстат', source_url: '',
      updated_at: '2026-10-15', frequency: 'month', demo: false, series,
    };
  };
  it('отклонение по региональному ряду даёт сигнал для своей культуры', () => {
    const ru = mk('russia', 2021, 2026, () => 30000, 9);
    const reg = mk('krasnodar', 2025, 2026, (y) => (y === 2026 ? 44000 : 36000), 9);
    const prof = buildRegionalProfile(ru, reg);
    const dev = seasonalDeviation(reg, prof, { date: '2026-10-26' });
    expect(dev.month).toBe(9);
    expect(dev.status).toBe('better');
    const s = buildSignals(ctx({ seasonality: [dev] }));
    const sig = s.find((x) => x.id === 'seasonality-sunflower')!;
    expect(sig.status).toBe('better');
    expect(p(sig.text)).toMatch(/^Подсолнечник: цена на \d+(,\d)?% выше обычной для сентября — хорошее окно для продажи/);
    expect(sig.effectRub).toBeCloseTo((dev.currentPrice - dev.normPrice) * 2.6, 6);
  });
});

// Общие контракты между агентами (раздел 12 CLAUDE.md).
// Меняет только оркестратор и только по согласованию. Агенты реализуют функции
// строго по типам-сигнатурам ниже: `export const f: F = (...) => ...`.

// ─────────────────────────────────────────────────────────────────────────────
// 1. Справочники: регионы, культуры, сезон            → src/config/regions.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Ключ региона, например 'krasnodar'. Строка, а не union: новый регион — одна запись в REGIONS. */
export type RegionId = string;
/** Уровень данных: регион или Россия в среднем (для сравнения в сценарии С3). */
export type GeoScope = RegionId | 'russia';

export type CropId = 'wheat' | 'barley' | 'sunflower' | 'corn';

export interface CropConfig {
  id: CropId;
  /** «Пшеница» */
  name: string;
  /** «пшеницы» — для фраз «цена пшеницы» */
  nameGenitive: string;
  /** Имя CSS-переменной цвета серии, закреплённого за культурой: '--crop-wheat' */
  colorVar: string;
}

export type SeasonPhaseId = 'sowing' | 'growing' | 'harvest' | 'sales';

/** Фаза «полосы сезона». Даты — 'MM-DD'; фаза может переходить через Новый год (from > to). */
export interface SeasonPhase {
  id: SeasonPhaseId;
  from: string;
  to: string;
}

export interface RegionConfig {
  id: RegionId;
  /** «Краснодарский край» */
  name: string;
  /** «Кубань» — для живой карточки на главной */
  shortName: string;
  /** Точка для Open-Meteo (центр зернового пояса региона) */
  lat: number;
  lon: number;
  timezone: string;
  /** С кем сравнивать урожайность в drill-down (С3) */
  compareWith: GeoScope[];
  crops: CropId[];
  /** Календарь работ по культуре для полосы сезона */
  season: Partial<Record<CropId, SeasonPhase[]>>;
  /** Затраты по умолчанию — ДОПУЩЕНИЯ, не статистика (раздел 7) */
  defaultCosts: Partial<Record<CropId, CostsPerHa>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Данные: public/data/*.json                         → data-engineer
// ─────────────────────────────────────────────────────────────────────────────

export type IndicatorId =
  | 'producer_price' // цена производителей, руб./т, month
  | 'diesel_price' // дизтопливо, руб./л, week
  | 'yield' // урожайность, ц/га, year
  | 'gross_harvest' // валовой сбор, тыс. т, year
  | 'sown_area' // посевная площадь, тыс. га, year
  | 'key_rate' // ключевая ставка, %, event
  | 'temperature_mean' // °C
  | 'temperature_min' // °C
  | 'temperature_max' // °C
  | 'precipitation' // мм
  | 'active_temp_sum' // сумма активных температур >10 °C, °C
  | 'dry_days'; // дни без осадков (<1 мм), дни

export type Frequency = 'day' | 'week' | 'month' | 'year' | 'event';

export type Unit = 'руб./т' | 'руб./л' | 'ц/га' | 'тыс. т' | 'тыс. га' | '%' | '°C' | 'мм' | 'дни';

/**
 * Точка ряда. date — всегда полная ISO-дата 'YYYY-MM-DD':
 * day/event — сам день; week — понедельник недели наблюдения;
 * month — первое число месяца; year — 'YYYY-01-01'.
 * value = null — пропуск в источнике (не ноль).
 */
export interface DataPoint {
  date: string;
  value: number | null;
}

/** Формат каждого файла public/data/*.json (раздел 9). Один файл — один ряд. */
export interface DataSeries {
  indicator: IndicatorId;
  region: GeoScope;
  /** null для показателей без культуры: дизель, ставка, погода */
  crop: CropId | null;
  unit: Unit;
  source: string;
  source_url: string;
  /** Дата актуальности данных, 'YYYY-MM-DD' */
  updated_at: string;
  frequency: Frequency;
  /** true — синтетический демо-ряд: на сайте обязательно бейдж «Демо-данные» */
  demo: boolean;
  series: DataPoint[];
  /** Необязательное пояснение (как построен демо-ряд, что за точка в регионе) */
  note?: string;
}

/** Ключ ряда. Имя файла: `${indicator}_${region}[_${crop}]_${frequency}.json`. */
export interface SeriesKey {
  indicator: IndicatorId;
  region: GeoScope;
  crop?: CropId | null;
  frequency: Frequency;
}

/** public/data/index.json — перечень доступных рядов (для «Источников» и загрузчика). */
export interface DataManifest {
  generated_at: string;
  files: Array<SeriesKey & { file: string; demo: boolean; source: string; updated_at: string }>;
}

/** Ссылка на источник — сопровождает каждую цифру на сайте. */
export interface SourceRef {
  source: string;
  source_url: string;
  updated_at: string;
  demo: boolean;
}

// src/lib/data.ts (data-engineer)
export type SeriesFileName = (key: SeriesKey) => string;
/** Загружает ряд из public/data. Ошибка сети/формата → reject с понятным сообщением. */
export type LoadSeries = (key: SeriesKey) => Promise<DataSeries>;
export type LoadManifest = () => Promise<DataManifest>;
export type SourceOf = (s: DataSeries) => SourceRef;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Погода                                            → src/lib/weather.ts (data-engineer)
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyWeather {
  date: string; // 'YYYY-MM-DD'
  tMin: number | null;
  tMax: number | null;
  tMean: number | null;
  precipitation: number | null; // мм
}

export interface MonthlyWeather {
  month: string; // 'YYYY-MM-01'
  tMean: number | null;
  precipitation: number; // мм за месяц
  /** Сумма среднесуточных температур дней с tMean > 10 °C */
  activeTempSum: number;
  /** Дней с осадками < 1 мм */
  dryDays: number;
}

export interface WeatherResult<T> {
  data: T;
  /** live — ответ Open-Meteo сейчас; cache — фолбэк из public/data/weather_*.json */
  origin: 'live' | 'cache';
  source: SourceRef;
}

/** Прогноз на N дней (по умолчанию 16) из api.open-meteo.com; при ошибке — кэш. */
export type FetchForecast = (region: RegionConfig, days?: number) => Promise<WeatherResult<DailyWeather[]>>;
/** Архив ERA5 из archive-api.open-meteo.com за [from, to]; при ошибке — кэш. */
export type FetchArchive = (region: RegionConfig, from: string, to: string) => Promise<WeatherResult<DailyWeather[]>>;
/** Чистая функция: дни → месяцы. */
export type AggregateMonthly = (days: DailyWeather[]) => MonthlyWeather[];

// ─────────────────────────────────────────────────────────────────────────────
// 4. Профиль хозяйства                                  → src/store/farm.ts (finance-modeler)
// ─────────────────────────────────────────────────────────────────────────────

/** Значение, которое может быть допущением (бейдж «Допущение» в интерфейсе). */
export interface Assumable {
  value: number;
  /** true — подставлено по умолчанию, пользователь не менял */
  assumption: boolean;
}

/** Затраты на гектар. Деньги — ₽/га, топливо — л/га (умножается на цену дизеля). */
export interface CostsPerHa {
  seeds: Assumable;
  fertilizers: Assumable;
  plantProtection: Assumable; // СЗР
  fuelLitersPerHa: Assumable;
  other: Assumable;
}

export interface CropPlan {
  crop: CropId;
  areaHa: number;
  /** Плановая урожайность, ц/га (в формулах переводится в т/га: /10) */
  yieldCha: Assumable;
  costs: CostsPerHa;
}

export interface FarmProfile {
  /** Версия схемы localStorage; при несовпадении — откат на демо */
  version: 1;
  name: string;
  region: RegionId;
  crops: CropPlan[];
  /** true — демо-хозяйство (1 200 га, Краснодарский край, пшеница + подсолнечник) */
  isDemo: boolean;
  updatedAt: string; // ISO
}

export interface LoadedProfile {
  profile: FarmProfile;
  /** saved — из localStorage; demo — нет сохранённого или он битый/недоступен */
  origin: 'saved' | 'demo';
}

export type LoadFarmProfile = () => LoadedProfile;
/** false — localStorage недоступен (приватный режим и т. п.); профиль живёт до перезагрузки. */
export type SaveFarmProfile = (profile: FarmProfile) => boolean;
export type ClearFarmProfile = () => void;
export type HasSavedProfile = () => boolean;
/** Подписка на изменения профиля; возвращает отписку. Без React — обёртку-хук делает ui-designer. */
export type SubscribeFarmProfile = (listener: (p: FarmProfile) => void) => () => void;

// ─────────────────────────────────────────────────────────────────────────────
// 5. Финансы                                            → src/lib/finance.ts (finance-modeler)
// ─────────────────────────────────────────────────────────────────────────────

/** Рыночные цены на момент расчёта. */
export interface MarketPrices {
  /** Цена продукции, ₽/т */
  pricePerT: number;
  /** Цена дизтоплива, ₽/л */
  dieselPerL: number;
}

export interface CostBreakdown {
  seeds: number;
  fertilizers: number;
  plantProtection: number;
  fuel: number; // л/га × ₽/л
  other: number;
}

/** Экономика одной культуры. Деньги — ₽; «на га» — ₽/га; «на т» — ₽/т. */
export interface CropEconomics {
  crop: CropId;
  areaHa: number;
  yieldTPerHa: number;
  pricePerT: number;
  dieselPerL: number;
  revenuePerHa: number;
  costPerHa: number;
  costBreakdown: CostBreakdown;
  /** Доля топлива в затратах, % */
  fuelSharePct: number;
  /** Себестоимость тонны; null при нулевой урожайности */
  costPerT: number | null;
  marginPerHa: number;
  /** Прибыль по культуре = маржа × площадь */
  profit: number;
  /** = себестоимость тонны; null при нулевой урожайности */
  breakevenPricePerT: number | null;
  /** Безубыточная урожайность, ц/га; null при нулевой цене */
  breakevenYieldCha: number | null;
}

export interface FarmEconomics {
  crops: CropEconomics[];
  totalAreaHa: number;
  revenue: number;
  cost: number;
  profit: number;
  /** Средневзвешенная по площади маржа, ₽/га */
  marginPerHa: number;
}

/** Состояние одного периода для факторного анализа (по одной культуре). */
export interface PeriodState {
  /** «Октябрь 2026», «Сезон 2025» */
  label: string;
  pricePerT: number;
  yieldCha: number;
  dieselPerL: number;
  fuelLitersPerHa: number;
  /** Затраты без топлива, ₽/га */
  nonFuelCostPerHa: number;
}

/**
 * Факторы в порядке цепных подстановок: цена → урожайность → затраты.
 * Затраты разложены на солярку и прочие, чтобы отдельно показать эффект солярки (С1).
 */
export type FactorId = 'price' | 'yield' | 'diesel' | 'otherCosts';

export interface FactorContribution {
  factor: FactorId;
  /** Значение фактора в базе и в текущем периоде (₽/т, ц/га, ₽/л, ₽/га) */
  from: number;
  to: number;
  /** Изменение фактора, %; null при from = 0 */
  changePct: number | null;
  /** Вклад в изменение маржи, ₽/га (знак: + улучшило, − ухудшило) */
  effectPerHa: number;
  /** Вклад в прибыль по культуре, ₽ = effectPerHa × площадь */
  effectTotal: number;
}

export interface FactorAnalysis {
  crop: CropId;
  areaHa: number;
  base: PeriodState;
  current: PeriodState;
  baseMarginPerHa: number;
  currentMarginPerHa: number;
  contributions: FactorContribution[];
  totalChangePerHa: number;
  totalChange: number;
  /** Невязка: totalChangePerHa − Σ effectPerHa. Должна быть 0 (тест). */
  residualPerHa: number;
}

/** Сдвиги «Что если», доли: −0.3 … +0.3 */
export interface WhatIfShifts {
  price: number;
  yield: number;
  diesel: number;
}

/** Строка торнадо-диаграммы: прибыль хозяйства при −range и +range по фактору. */
export interface TornadoBar {
  factor: 'price' | 'yield' | 'diesel';
  lowProfit: number;
  highProfit: number;
  baseProfit: number;
}

/** Цены и урожайность из данных на дату (последнее известное значение ≤ date). */
export interface MarketData {
  price: DataSeries; // producer_price по культуре
  diesel: DataSeries; // diesel_price
  yield: DataSeries; // yield по культуре (для периодов «сезон к сезону»)
}

export type ComputeCropEconomics = (plan: CropPlan, prices: MarketPrices) => CropEconomics;
/** prices — по культуре: цена у каждой своя, дизель общий. */
export type ComputeFarmEconomics = (
  profile: FarmProfile,
  prices: Partial<Record<CropId, MarketPrices>>,
) => FarmEconomics;
export type FactorAnalysisFn = (base: PeriodState, current: PeriodState, areaHa: number, crop: CropId) => FactorAnalysis;
/** Состояние периода из профиля и рядов на дату. yieldFromData: true — урожайность из ряда, иначе из плана. */
export type PeriodStateAt = (
  plan: CropPlan,
  data: MarketData,
  date: string,
  opts?: { label?: string; yieldFromData?: boolean },
) => PeriodState;
export type ApplyWhatIf = (plan: CropPlan, prices: MarketPrices, shifts: WhatIfShifts) => CropEconomics;
/** range по умолчанию 0.3 */
export type Sensitivity = (profile: FarmProfile, prices: Partial<Record<CropId, MarketPrices>>, range?: number) => TornadoBar[];

// ─────────────────────────────────────────────────────────────────────────────
// 6. Сезонность                                         → src/lib/seasonality.ts (finance-modeler)
// ─────────────────────────────────────────────────────────────────────────────

export interface SeasonalMonth {
  month: number; // 1–12
  /** Средняя цена месяца относительно среднегодовой: 1.06 = на 6% выше */
  index: number;
  /** Норма для месяца, ₽/т (в ценах последнего года) */
  normPrice: number;
  min: number;
  max: number;
  /** Сколько лет вошло в расчёт */
  years: number;
}

export interface SeasonalProfile {
  crop: CropId;
  region: GeoScope;
  /** Годы, по которым построен профиль */
  years: number[];
  months: SeasonalMonth[]; // 12 элементов
  source: SourceRef;
}

export interface SeasonalDeviation {
  date: string;
  month: number;
  currentPrice: number;
  normPrice: number;
  /** current / norm − 1, % */
  deviationPct: number;
  /** Для продавца: выше нормы — better, ниже — worse, в пределах порога — normal */
  status: SignalStatus;
}

/** Профиль по последним `years` полным годам (по умолчанию 5). Метод — в методике. */
export type BuildSeasonalProfile = (series: DataSeries, years?: number) => SeasonalProfile;
/** Отклонение цены на дату (по умолчанию — последняя точка) от нормы. thresholdPct по умолчанию 3. */
export type SeasonalDeviationFn = (
  series: DataSeries,
  profile: SeasonalProfile,
  opts?: { date?: string; thresholdPct?: number },
) => SeasonalDeviation;

// ─────────────────────────────────────────────────────────────────────────────
// 7. Сигналы «Что изменилось» и погодные риски           → src/lib/signals.ts (finance-modeler)
// ─────────────────────────────────────────────────────────────────────────────

/** Хуже / норма / лучше. В интерфейсе — всегда иконка + подпись + цвет. */
export type SignalStatus = 'worse' | 'normal' | 'better';

export type SignalKind = 'price' | 'diesel' | 'yield' | 'weather' | 'seasonality' | 'key_rate';

export interface Signal {
  id: string;
  kind: SignalKind;
  status: SignalStatus;
  /** Коротко: «Солярка +4%» */
  title: string;
  /** Языком фермера: «Солярка подорожала на 4% — это −620 ₽ с гектара» */
  text: string;
  /** Рублёвый эффект; null — фактор не переводится в рубли (погода) */
  effectRub: number | null;
  effectUnit: '₽/га' | '₽' | null;
  changePct: number | null;
  /** Куда ведёт клик — путь из src/routes.ts */
  link: string;
  /** Больше — важнее; лента берёт топ-3 */
  priority: number;
  source: SourceRef;
}

export type WeatherRiskType = 'frost' | 'heat' | 'dry_spell';

export interface WeatherRisk {
  type: WeatherRiskType;
  from: string;
  to: string;
  /** «Заморозок до −3 °C 4–5 ноября» */
  text: string;
  status: Extract<SignalStatus, 'worse' | 'normal'>;
}

export interface SignalContext {
  profile: FarmProfile;
  /** Анализ по каждой культуре: прошлый месяц → текущий */
  analyses: FactorAnalysis[];
  seasonality?: SeasonalDeviation[];
  weatherRisks?: WeatherRisk[];
  sources: Partial<Record<SignalKind, SourceRef>>;
}

/** Все сигналы, отсортированные по priority (убыв.). */
export type BuildSignals = (ctx: SignalContext) => Signal[];
/** Один совет-вывод для главного экрана; null — сказать нечего. */
export type PickAdvice = (signals: Signal[]) => Signal | null;
/** Пороги: заморозок tMin ≤ 0 °C, жара tMax > 35 °C, сухой период ≥ N дней осадков < 1 мм. */
export type DetectWeatherRisks = (forecast: DailyWeather[]) => WeatherRisk[];

// ─────────────────────────────────────────────────────────────────────────────
// 8. Ряды и форматирование                              → src/lib/series.ts, src/lib/format.ts (finance-modeler)
// ─────────────────────────────────────────────────────────────────────────────

/** Последнее непустое значение с датой ≤ date (по умолчанию — последнее в ряду). */
export type ValueAt = (series: DataSeries, date?: string) => DataPoint | null;
/** Изменение между двумя датами, %; null если нет данных или база = 0. */
export type ChangePct = (series: DataSeries, from: string, to: string) => number | null;

/** Русский формат: «1 234 567,8», минус — «−», неразрывные пробелы. */
export type FormatNumber = (value: number, fractionDigits?: number) => string;
/** «−1 850 ₽», «+742 000 ₽», «12 400 ₽/т». sign: true — всегда со знаком. */
export type FormatRub = (value: number, opts?: { unit?: '₽' | '₽/га' | '₽/т'; sign?: boolean; compact?: boolean }) => string;
/** «+4%», «−3,2%» */
export type FormatPct = (value: number, opts?: { fractionDigits?: number; sign?: boolean }) => string;

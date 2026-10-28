// Регионы и культуры (раздел 3). Владелец — data-engineer. Новый регион — одна запись в REGIONS.
import type { Assumable, CostsPerHa, CropConfig, CropId, RegionConfig, RegionId, SeasonPhase } from '../types';

export const CROPS: Record<CropId, CropConfig> = {
  wheat: { id: 'wheat', name: 'Пшеница', nameGenitive: 'пшеницы', colorVar: '--crop-wheat' },
  barley: { id: 'barley', name: 'Ячмень', nameGenitive: 'ячменя', colorVar: '--crop-barley' },
  sunflower: { id: 'sunflower', name: 'Подсолнечник', nameGenitive: 'подсолнечника', colorVar: '--crop-sunflower' },
  corn: { id: 'corn', name: 'Кукуруза на зерно', nameGenitive: 'кукурузы', colorVar: '--crop-corn' },
};

/** Допущение: условное значение, не статистика (раздел 7 CLAUDE.md). */
const a = (value: number): Assumable => ({ value, assumption: true });

const costs = (
  seeds: number,
  fertilizers: number,
  plantProtection: number,
  fuelLitersPerHa: number,
  other: number,
): CostsPerHa => ({
  seeds: a(seeds),
  fertilizers: a(fertilizers),
  plantProtection: a(plantProtection),
  fuelLitersPerHa: a(fuelLitersPerHa),
  other: a(other),
});

const phases = (
  sowing: [string, string],
  growing: [string, string],
  harvest: [string, string],
  sales: [string, string],
): SeasonPhase[] => [
  { id: 'sowing', from: sowing[0], to: sowing[1] },
  { id: 'growing', from: growing[0], to: growing[1] },
  { id: 'harvest', from: harvest[0], to: harvest[1] },
  { id: 'sales', from: sales[0], to: sales[1] },
];

// defaultCosts — полные затраты на гектар, условное допущение, не статистика (₽/га, л/га, уровень 2026 г.).
// Порядок: семена, удобрения, СЗР, топливо (л/га), прочие. «Прочие» (other) складываются из: аренды или земельного
// налога, оплаты труда с взносами, амортизации и ремонта техники, страхования, хранения и доработки (сушка, очистка),
// накладных расходов. Значения подобраны так, чтобы при плановой урожайности (Кубань: пшеница 55, ячмень 50, подсолнечник 26,
// кукуруза 60 ц/га; Саратов: 25, 20, 15, 35) и ценах октября 2026 г. маржа была около 10–25% выручки.
// season — типовой календарь зоны, ориентир для полосы сезона; фазы озимых переходят через Новый год.
export const REGIONS: Record<RegionId, RegionConfig> = {
  krasnodar: {
    id: 'krasnodar',
    name: 'Краснодарский край',
    shortName: 'Кубань',
    lat: 45.03,
    lon: 39.97,
    timezone: 'Europe/Moscow',
    compareWith: ['saratov', 'russia'],
    crops: ['wheat', 'barley', 'sunflower', 'corn'],
    season: {
      wheat: phases(['09-25', '11-10'], ['11-11', '06-14'], ['06-15', '07-31'], ['08-01', '10-31']),
      barley: phases(['09-25', '10-31'], ['11-01', '06-04'], ['06-05', '07-15'], ['07-16', '10-31']),
      sunflower: phases(['04-10', '05-10'], ['05-11', '08-24'], ['08-25', '10-15'], ['10-16', '02-28']),
      corn: phases(['04-15', '05-15'], ['05-16', '09-09'], ['09-10', '11-10'], ['11-11', '03-31']),
    },
    defaultCosts: {
      wheat: costs(7000, 22000, 11000, 62, 34600),
      barley: costs(6000, 17000, 8000, 55, 26000),
      sunflower: costs(11000, 17000, 13000, 58, 31100),
      corn: costs(12000, 20000, 8000, 78, 27400),
    },
  },
  saratov: {
    id: 'saratov',
    name: 'Саратовская область',
    shortName: 'Саратовщина',
    lat: 51.5,
    lon: 46.0,
    timezone: 'Europe/Saratov',
    compareWith: ['krasnodar', 'russia'],
    crops: ['wheat', 'barley', 'sunflower', 'corn'],
    season: {
      wheat: phases(['09-01', '09-20'], ['09-21', '07-14'], ['07-15', '08-31'], ['08-01', '10-31']),
      barley: phases(['04-20', '05-15'], ['05-16', '07-14'], ['07-15', '08-25'], ['08-26', '12-31']),
      sunflower: phases(['04-25', '05-20'], ['05-21', '09-09'], ['09-10', '10-31'], ['11-01', '03-15']),
      corn: phases(['05-01', '05-25'], ['05-26', '09-19'], ['09-20', '11-10'], ['11-11', '03-31']),
    },
    defaultCosts: {
      wheat: costs(4000, 6500, 3000, 52, 14400),
      barley: costs(3500, 5000, 2500, 48, 7500),
      sunflower: costs(6500, 5500, 4500, 50, 21400),
      corn: costs(8000, 10000, 4000, 66, 12800),
    },
  },
};

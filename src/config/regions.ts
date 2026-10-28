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

// defaultCosts — условные допущения (₽/га, л/га на 2026 г.), условное допущение, не статистика.
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
      wheat: phases(['09-25', '11-10'], ['11-11', '06-14'], ['06-15', '07-31'], ['08-01', '09-24']),
      barley: phases(['09-25', '10-31'], ['11-01', '06-04'], ['06-05', '07-15'], ['07-16', '09-24']),
      sunflower: phases(['04-10', '05-10'], ['05-11', '08-24'], ['08-25', '10-15'], ['10-16', '04-09']),
      corn: phases(['04-15', '05-15'], ['05-16', '09-09'], ['09-10', '11-10'], ['11-11', '04-14']),
    },
    defaultCosts: {
      wheat: costs(4200, 9500, 3800, 62, 6500),
      barley: costs(3600, 8200, 3200, 55, 5800),
      sunflower: costs(5600, 7800, 4500, 58, 6800),
      corn: costs(7800, 12500, 4200, 78, 8200),
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
      wheat: phases(['08-20', '09-20'], ['09-21', '07-14'], ['07-15', '08-31'], ['09-01', '08-19']),
      barley: phases(['04-20', '05-15'], ['05-16', '07-14'], ['07-15', '08-25'], ['08-26', '04-19']),
      sunflower: phases(['04-25', '05-20'], ['05-21', '09-09'], ['09-10', '10-31'], ['11-01', '04-24']),
      corn: phases(['05-01', '05-25'], ['05-26', '09-19'], ['09-20', '11-10'], ['11-11', '04-30']),
    },
    defaultCosts: {
      wheat: costs(3600, 5200, 2600, 52, 5200),
      barley: costs(3200, 4600, 2300, 48, 4800),
      sunflower: costs(5200, 5800, 3600, 50, 5600),
      corn: costs(7000, 9800, 3600, 66, 6800),
    },
  },
};

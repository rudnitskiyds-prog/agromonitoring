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

// defaultCosts — полные затраты на гектар, условное допущение (assumption: true), не статистика. База — 2024 год, инфляция
// к 2026 г. НЕ добавлена (цены и затраты 2026 г. могут быть выше). Считаются scripts/calibrate_costs.py:
//  1) себестоимость тонны = средняя за 2024 г. реальная цена производителей региона (public/data/producer_price_{регион}_{культура}_month)
//     / (1 + рентабельность без субсидий по РФ за 2024 г.: зерно 16,8%, семена подсолнечника 52,4%) —
//     Росстат, «Сельское хозяйство в России 2025», табл. 6.18 (PDF-стр. 78), выборка в raw/sx2025_cost_tables.csv;
//  2) затраты на га = себестоимость тонны × средняя реальная урожайность региона за 2022–2024 гг. (yield_{регион}_{культура}_year);
//  3) топливо = л/га × средняя цена дизтоплива 2024 г. (diesel_price_{регион}_month); семена, удобрения, СЗР вместе = 55,9% затрат
//     («сырьё и материалы», табл. 6.2, стр. 68) в прежних пропорциях друг к другу; «прочие» (other) — остаток: оплата труда,
//     амортизация, аренда или земельный налог, энергия, страхование, хранение и доработка, накладные расходы.
// Порядок в costs(): семена, удобрения, СЗР, топливо (л/га), прочие.
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
      wheat: costs(7200, 22600, 11300, 62, 28600),
      barley: costs(7200, 20300, 9600, 55, 25700),
      sunflower: costs(7600, 11800, 9000, 58, 18900),
      corn: costs(9900, 16400, 6600, 78, 21100),
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
      wheat: costs(4300, 7000, 3200, 52, 8200),
      barley: costs(2400, 3400, 1700, 48, 2600),
      sunflower: costs(6300, 5300, 4300, 50, 9400),
      corn: costs(10600, 13300, 5300, 66, 18800),
    },
  },
};

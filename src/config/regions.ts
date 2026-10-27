// Регионы и культуры (раздел 3). Владелец — data-engineer. Новый регион — одна запись в REGIONS.
import type { CropConfig, CropId, RegionConfig, RegionId } from '../types';

export const CROPS: Record<CropId, CropConfig> = {
  wheat: { id: 'wheat', name: 'Пшеница', nameGenitive: 'пшеницы', colorVar: '--crop-wheat' },
  barley: { id: 'barley', name: 'Ячмень', nameGenitive: 'ячменя', colorVar: '--crop-barley' },
  sunflower: { id: 'sunflower', name: 'Подсолнечник', nameGenitive: 'подсолнечника', colorVar: '--crop-sunflower' },
  corn: { id: 'corn', name: 'Кукуруза на зерно', nameGenitive: 'кукурузы', colorVar: '--crop-corn' },
};

// TODO(data-engineer): координаты, календарь сезона, затраты-допущения.
export const REGIONS: Record<RegionId, RegionConfig> = {};

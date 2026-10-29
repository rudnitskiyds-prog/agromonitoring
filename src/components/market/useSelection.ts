// Регион и культура страницы: query (?region=&crop=) перекрывает профиль.
// По умолчанию — регион профиля и главная культура (наибольшая площадь).
import { useLocation } from 'react-router-dom';
import { CROPS, REGIONS } from '../../config/regions';
import { readParams } from '../../routes';
import type { CropId, FarmProfile, RegionId } from '../../types';

export const mainCrop = (p: FarmProfile): CropId | undefined => [...p.crops].sort((a, b) => b.areaHa - a.areaHa)[0]?.crop;
const isCrop = (x: string | null): x is CropId => !!x && x in CROPS;

export function useSelection(profile: FarmProfile): { region: RegionId; crop: CropId; focus: string | null } {
  const { search } = useLocation();
  const q = readParams(search);
  const qr = q.get('region');
  const region: RegionId = qr && REGIONS[qr] ? qr : REGIONS[profile.region] ? profile.region : Object.keys(REGIONS)[0];
  const qc = q.get('crop');
  const crops = REGIONS[region].crops;
  const fallback = mainCrop(profile);
  const crop: CropId = isCrop(qc) && crops.includes(qc) ? qc : fallback && crops.includes(fallback) ? fallback : crops[0];
  return { region, crop, focus: q.get('focus') };
}

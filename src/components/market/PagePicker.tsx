// Выбор региона и культуры для «Рынка» и «Урожая»: ссылки с query, а не локальное состояние —
// так выбор переживает перезагрузку и им можно поделиться (сценарии С2, С3).
import { Link } from 'react-router-dom';
import { CROPS, REGIONS } from '../../config/regions';
import { texts } from '../../content/texts';
import type { CropId, RegionId } from '../../types';

import { cropShortName } from '../../lib/signals';

const L_REGION = texts.market.regionLabel;

export interface PagePickerProps {
  region: RegionId;
  crop: CropId;
  /** Культуры профиля — помечаем точкой «ваше» */
  profileCrops: CropId[];
  link: (p: { region: RegionId; crop: CropId }) => string;
  className?: string;
}

const chip =
  'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-control border px-3 text-sm transition-colors';
const chipOn = 'border-ink bg-ink text-bg font-semibold';
const chipOff = 'border-line-strong bg-surface text-ink/85 hover:border-accent hover:text-accent';

export default function PagePicker({ region, crop, profileCrops, link, className = '' }: PagePickerProps) {
  const cfg = REGIONS[region];
  const crops = cfg?.crops ?? (Object.keys(CROPS) as CropId[]);
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label={L_REGION}>
        <span className="kicker mr-1 w-full sm:w-auto">{L_REGION}</span>
        {Object.values(REGIONS).map((r) => {
          const on = r.id === region;
          const c = r.crops.includes(crop) ? crop : r.crops[0];
          return (
            <Link
              key={r.id}
              to={link({ region: r.id, crop: c })}
              replace
              aria-current={on ? 'true' : undefined}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              {r.shortName}
            </Link>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label={texts.common.cropPicker.label}>
        <span className="kicker mr-1 w-full sm:w-auto">{texts.common.cropPicker.label}</span>
        {crops.map((id) => {
          const on = id === crop;
          return (
            <Link
              key={id}
              to={link({ region, crop: id })}
              replace
              aria-current={on ? 'true' : undefined}
              className={`${chip} ${on ? chipOn : chipOff}`}
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: `rgb(var(${CROPS[id].colorVar}))` }}
              />
              {cropShortName(id)}
              {profileCrops.includes(id) && (
                <span className={`text-[11px] font-normal ${on ? 'text-bg/70' : 'text-muted'}`}>
                  {texts.market.cropInProfile}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Шапка страниц расчёта: чьё хозяйство (демо или своё), площадь и регион, ссылка «Изменить».
import { PencilLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { REGIONS } from '../../config/regions';
import { texts } from '../../content/texts';
import { formatNumber } from '../../lib/format';
import { ROUTES } from '../../routes';
import type { FarmProfile } from '../../types';

const C = texts.common;

export default function FarmHeader({ profile, className = '' }: { profile: FarmProfile; className?: string }) {
  const area = profile.crops.reduce((s, c) => s + c.areaHa, 0);
  const region = REGIONS[profile.region];
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-sm ${className}`}>
      <span className="kicker">{C.farmChip.label}</span>
      <span
        className={`font-semibold text-ink ${profile.isDemo ? 'rounded-tag border border-dashed border-line-strong px-1.5' : ''}`}
        title={profile.isDemo ? C.badges.demoFarmHint : undefined}
      >
        {profile.isDemo ? C.badges.demoFarm : profile.name}
      </span>
      <span className="num text-muted">{C.farmChip.summary(formatNumber(area), region?.shortName ?? profile.region)}</span>
      <Link to={ROUTES.farm.path} className="link inline-flex items-center gap-1 text-sm">
        <PencilLine size={13} aria-hidden />
        {C.actions.editFarm}
      </Link>
    </div>
  );
}

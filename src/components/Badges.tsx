import { FlaskConical, PencilLine } from 'lucide-react';

import { texts } from '../content/texts';

const B = texts.common.badges;
const DEMO_LABEL = B.demo;
const DEMO_HINT = B.demoHint;
const ASSUMPTION_LABEL = B.assumption;
const ASSUMPTION_HINT = B.assumptionHint;

interface BadgeProps {
  className?: string;
  /** Подсказка по наведению; по умолчанию — пояснение, что это не статистика */
  title?: string;
  /** compact — только иконка и короткая подпись, для плотных мест (поле формы) */
  size?: 'md' | 'sm';
}

const sizeCls = { md: 'h-6 px-2 text-xs gap-1.5', sm: 'h-5 px-1.5 text-[11px] gap-1' };

/** «Демо-данные»: пунктирная рамка — «черновая запись», не настоящая статистика. */
export function DemoBadge({ className = '', title = DEMO_HINT, size = 'md' }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-tag border border-dashed border-line-strong bg-surface font-medium text-muted ${sizeCls[size]} ${className}`}
    >
      <FlaskConical size={size === 'md' ? 13 : 12} strokeWidth={2} aria-hidden />
      {DEMO_LABEL}
    </span>
  );
}

/** «Допущение»: пометка карандашом на полях — значение по умолчанию, редактируемое. */
export function AssumptionBadge({ className = '', title = ASSUMPTION_HINT, size = 'md' }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-tag bg-ochre-soft font-medium text-ink/80 ${sizeCls[size]} ${className}`}
    >
      <PencilLine size={size === 'md' ? 13 : 12} strokeWidth={2} className="text-ochre" aria-hidden />
      {ASSUMPTION_LABEL}
    </span>
  );
}

export default DemoBadge;

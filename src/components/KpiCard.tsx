import type { ReactNode } from 'react';
import type { SignalStatus, SourceRef } from '../types';
import SourceNote from './SourceNote';
import StatusTag from './StatusTag';

export interface KpiCardProps {
  /** Подпись-вопрос или название: «Прибыль хозяйства за сезон» */
  label: string;
  /** Уже отформатированное число: formatRub(...) */
  value: string;
  /** Пояснение под числом: «12 400 ₽/т при цене 13 900 ₽/т» */
  hint?: ReactNode;
  status?: SignalStatus;
  statusLabel?: string;
  /** Бейдж рядом с подписью (AssumptionBadge, DemoBadge) */
  badge?: ReactNode;
  source?: SourceRef;
  /** lg — главный итог экрана, md — в ряду показателей */
  size?: 'lg' | 'md';
  /** flat — без рамки, для размещения внутри другого блока */
  flat?: boolean;
  className?: string;
}

/** Крупное число + подпись. */
export default function KpiCard({
  label,
  value,
  hint,
  status,
  statusLabel,
  badge,
  source,
  size = 'md',
  flat = false,
  className = '',
}: KpiCardProps) {
  const frame = flat ? '' : 'rounded-card border border-line bg-surface p-4 sm:p-5';
  return (
    <div className={`flex flex-col ${frame} ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">{label}</p>
        {badge}
      </div>
      <p
        className={`num-display mt-2 font-semibold leading-none text-ink ${
          size === 'lg' ? 'text-[34px] sm:text-[44px]' : 'whitespace-nowrap text-[22px]'
        }`}
      >
        {value}
      </p>
      {(hint || status) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-ink/80">
          {status && <StatusTag status={status} label={statusLabel} size="sm" />}
          {hint && <span className="num">{hint}</span>}
        </div>
      )}
      {source && <SourceNote source={source} className="mt-auto pt-3" />}
    </div>
  );
}

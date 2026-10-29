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
  source?: SourceRef | SourceRef[];
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
      {/* Бейдж справа от подписи; у md подпись резервирует две строки — числа в ряду стоят на одной линии */}
      <div className={`flex items-start justify-between gap-2 ${size === 'md' ? 'min-h-[2.5rem]' : ''}`}>
        <p className="min-w-0 text-sm leading-5 text-muted">{label}</p>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      <p
        className={`num-display mt-1.5 font-semibold leading-none text-ink ${
          size === 'lg' ? 'text-[34px] sm:text-[44px]' : 'whitespace-nowrap text-[18px] sm:text-[20px]'
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

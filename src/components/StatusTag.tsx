import { CircleCheck, CircleMinus, TriangleAlert } from 'lucide-react';
import type { SignalStatus } from '../types';

import { texts } from '../content/texts';

export const STATUS_LABEL: Record<SignalStatus, string> = {
  worse: texts.common.status.worse,
  normal: texts.common.status.normal,
  better: texts.common.status.better,
};

/** Иконка, цвет текста и фон по статусу. Сигнал никогда не передаётся только цветом. */
export const STATUS_STYLE: Record<SignalStatus, { Icon: typeof CircleCheck; text: string; bg: string; border: string }> = {
  worse: { Icon: TriangleAlert, text: 'text-status-worse', bg: 'bg-status-worse-bg', border: 'border-status-worse' },
  normal: { Icon: CircleMinus, text: 'text-status-normal', bg: 'bg-status-normal-bg', border: 'border-status-normal' },
  better: { Icon: CircleCheck, text: 'text-status-better', bg: 'bg-status-better-bg', border: 'border-status-better' },
};

export interface StatusTagProps {
  status: SignalStatus;
  /** Своя подпись вместо «Хуже/Норма/Лучше», например «Окно для продаж» */
  label?: string;
  size?: 'md' | 'sm';
  /** plain — без плашки: иконка + подпись цветом (для плотных строк) */
  plain?: boolean;
  className?: string;
}

/** Статус сигнала: иконка lucide + подпись + цвет. */
export default function StatusTag({ status, label, size = 'md', plain = false, className = '' }: StatusTagProps) {
  const s = STATUS_STYLE[status];
  const iconSize = size === 'md' ? 14 : 12;
  const box = plain
    ? 'gap-1'
    : `${s.bg} rounded-tag ${size === 'md' ? 'h-6 px-2 gap-1.5' : 'h-5 px-1.5 gap-1'}`;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap font-semibold ${s.text} ${box} ${
        size === 'md' ? 'text-xs' : 'text-[11px]'
      } ${className}`}
    >
      <s.Icon size={iconSize} strokeWidth={2.25} aria-hidden />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

// Общие состояния блока: загрузка (скелет), ошибка (что случилось и что сделать), пусто.
// Высота скелета задаётся под будущий контент — вёрстка не прыгает. При prefers-reduced-motion скелет не мигает.
import { Inbox, RotateCw, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { texts } from '../content/texts';
import Button from './Button';

const C = texts.common;

export interface SkeletonProps {
  /** Высота блока: число — px, строка — любое CSS-значение */
  height?: number | string;
  width?: string;
  className?: string;
}

/** Блок-заглушка. Скрыт от чтения с экрана: о загрузке сообщает LoadingState. */
export function Skeleton({ height = 16, width = '100%', className = '' }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-control bg-surface-2 motion-reduce:animate-none ${className}`}
      style={{ height, width }}
    />
  );
}

export interface LoadingStateProps {
  /** Что грузим: texts.common.loading.* */
  label?: string;
  /** Набор заглушек под форму будущего блока; по умолчанию — заголовок, крупное число и строка */
  children?: ReactNode;
  /** Обернуть в карточку (как будущий блок) */
  framed?: boolean;
  className?: string;
}

export function LoadingState({ label = C.loading.default, children, framed = true, className = '' }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`${framed ? 'rounded-card border border-line bg-surface p-card sm:p-card-lg' : ''} ${className}`}
    >
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-stack space-y-3">
        {children ?? (
          <>
            <Skeleton height={44} width="60%" />
            <Skeleton height={16} />
            <Skeleton height={16} width="80%" />
          </>
        )}
      </div>
    </div>
  );
}

export interface ErrorStateProps {
  /** Заголовок: по умолчанию texts.common.errors.loadTitle */
  title?: string;
  /** Что случилось и что сделать: texts.common.errors.load / loadSeries(what) */
  message?: string;
  /** Повторить загрузку; без него кнопки нет */
  onRetry?: () => void;
  retryLabel?: string;
  /** Дополнительное действие: ссылка «Открыть демо», «Вернуться на главную» */
  action?: ReactNode;
  className?: string;
}

export function ErrorState({ title = C.errors.loadTitle, message = C.errors.load, onRetry, retryLabel = C.actions.retry, action, className = '' }: ErrorStateProps) {
  return (
    <div role="alert" className={`rounded-card border border-line bg-surface p-card sm:p-card-lg ${className}`}>
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert size={17} className="shrink-0 text-status-worse" aria-hidden />
        {title}
      </p>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink/80">{message}</p>
      {(onRetry || action) && (
        <div className="mt-stack flex flex-wrap items-center gap-3">
          {onRetry && (
            <Button variant="secondary" size="sm" iconLeft={<RotateCw size={14} aria-hidden />} onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title = C.empty.title, message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`rounded-card border border-dashed border-line-strong p-card sm:p-card-lg ${className}`}>
      <p className="flex items-center gap-2 font-semibold text-ink/85">
        <Inbox size={17} className="shrink-0 text-muted" aria-hidden />
        {title}
      </p>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">{message}</p>
      {action && <div className="mt-stack">{action}</div>}
    </div>
  );
}

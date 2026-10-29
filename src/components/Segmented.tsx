// Переключатель из 2–4 вариантов: период, культура, вид графика. Варианты — ссылки (to) или кнопки (onSelect).
import { Link } from 'react-router-dom';

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  /** Путь роутера — вариант становится ссылкой (состояние живёт в query) */
  to?: string;
}

export interface SegmentedProps<T extends string> {
  /** Подпись группы для чтения с экрана: «Период сравнения» */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onSelect?: (id: T) => void;
  size?: 'md' | 'sm';
  /** Ссылки заменяют запись истории (по умолчанию). false — «назад» вернёт прежний вариант */
  replace?: boolean;
  className?: string;
}

export default function Segmented<T extends string>({
  label,
  options,
  value,
  onSelect,
  size = 'md',
  replace = true,
  className = '',
}: SegmentedProps<T>) {
  const item = size === 'md' ? 'h-9 px-3.5 text-sm' : 'h-8 px-3 text-[13px]';
  return (
    <div role="group" aria-label={label} className={`inline-flex max-w-full flex-wrap rounded-control border border-line bg-surface-2/60 p-0.5 ${className}`}>
      {options.map((o) => {
        const on = o.id === value;
        const cls = `inline-flex items-center justify-center whitespace-nowrap rounded-[4px] font-medium transition-colors ${item} ${
          on ? 'bg-surface text-ink shadow-lift' : 'text-muted hover:text-ink'
        }`;
        return o.to ? (
          <Link key={o.id} to={o.to} replace={replace} aria-current={on ? 'true' : undefined} className={cls}>
            {o.label}
          </Link>
        ) : (
          <button key={o.id} type="button" aria-pressed={on} onClick={() => onSelect?.(o.id)} className={cls}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

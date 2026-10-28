// Числовое поле формы: крупное, единица прямо в поле, русский ввод с запятой, числовая клавиатура.
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { formatNumber } from '../lib/format';
import { AssumptionBadge } from './Badges';

/**
 * «34 600», «5,5», «5.5», «.5», «−3» → число; пусто → null; мусор и незаконченный ввод («-», «.», «1e5») → NaN.
 * Минус — и «-», и «−» (U+2212, его ставит formatNumber).
 */
export function parseRuNumber(raw: string): number | null {
  const s = raw.replace(/[\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-').replace(',', '.');
  if (s === '') return null;
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return Number.NaN;
  return Number(s);
}

/** Одно и то же число (оба NaN, оба null, или равны с точностью до округления). */
function sameNumber(a: number | null, b: number | null): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return Math.abs(a - b) < 1e-9;
}

/** Число → строка для поля в русском формате: «34 600», «48,5». */
export function toFieldString(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '';
  return formatNumber(v, 2);
}

export interface NumberFieldProps {
  label: string;
  unit: string;
  value: number | null;
  /** Вызывается с распарсенным числом (null — пусто, NaN — не число) и сырой строкой */
  onChange: (value: number | null, raw: string) => void;
  hint?: ReactNode;
  error?: string | null;
  /** Значение — допущение по умолчанию: показываем бейдж */
  assumption?: boolean;
  /** Кнопка «вернуть значение по умолчанию» (показывается, когда значение изменено) */
  onReset?: () => void;
  resetLabel?: string;
  /** Подпись для кнопки сброса рядом с меткой: «Ваше значение» */
  editedNote?: string;
  size?: 'lg' | 'md';
  className?: string;
}

export default function NumberField({
  label,
  unit,
  value,
  onChange,
  hint,
  error,
  assumption,
  onReset,
  resetLabel,
  editedNote,
  size = 'lg',
  className = '',
}: NumberFieldProps) {
  const id = useId();
  const [raw, setRaw] = useState(() => toFieldString(value));
  // Синхронизация при внешнем изменении (сброс, смена региона), если строка означает другое число
  useEffect(() => {
    // Перезаписываем строку только при внешнем изменении: свой промежуточный ввод («-», «.», «abc») не трогаем
    if (!sameNumber(parseRuNumber(raw), value)) setRaw(toFieldString(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const showReset = !!onReset && assumption === false;
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium leading-5 text-ink">
        {label}
      </label>
      <div
        className={`mt-1.5 flex items-stretch overflow-hidden rounded-control border bg-surface transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${
          error ? 'border-status-worse' : 'border-line-strong'
        } ${assumption ? 'border-dashed' : ''}`}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          value={raw}
          onBlur={() => {
            // после ввода приводим к русскому формату с разрядами; мусор оставляем как есть — рядом ошибка
            const v = parseRuNumber(raw);
            if (v !== null && !Number.isNaN(v)) setRaw(toFieldString(v));
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setRaw(e.target.value);
            onChange(parseRuNumber(e.target.value), e.target.value);
          }}
          className={`num min-w-0 flex-1 bg-transparent px-3 font-semibold text-ink outline-none placeholder:text-muted/60 ${
            size === 'lg' ? 'h-12 text-[18px]' : 'h-10 text-[16px]'
          }`}
        />
        <span className="flex shrink-0 items-center border-l border-line bg-surface-2/60 px-3 text-sm text-muted">{unit}</span>
      </div>
      {(assumption || showReset) && (
        <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-2">
          {assumption && <AssumptionBadge size="sm" />}
          {showReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-tag text-xs text-muted underline decoration-line-strong underline-offset-2 hover:text-accent"
            >
              <RotateCcw size={12} aria-hidden />
              {editedNote ? `${editedNote} · ` : ''}
              {resetLabel}
            </button>
          )}
        </div>
      )}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-status-worse" role="alert">
          <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs leading-snug text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

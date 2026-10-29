// Ползунок сдвига фактора ±30% с шагом 1%: подпись, текущее значение, шкала −30 / 0 / +30.
import { useId } from 'react';
import { texts } from '../../content/texts';
import { formatPct } from '../../lib/format';

export interface ShiftSliderProps {
  label: string;
  hint?: string;
  /** Сдвиг в процентах, целое −30…30 */
  value: number;
  onChange: (pct: number) => void;
  /** Что даёт ползунок в абсолюте: «17 590 → 18 469 ₽/т» */
  valueNote?: string;
  min?: number;
  max?: number;
}

export default function ShiftSlider({ label, hint, value, onChange, valueNote, min = -30, max = 30 }: ShiftSliderProps) {
  const id = useId();
  const pctText = formatPct(value, { fractionDigits: 0 });
  const fill = ((value - min) / (max - min)) * 100;
  const zero = ((0 - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[15px] font-semibold text-ink">
          {label}
        </label>
        <output htmlFor={id} className={`num text-[20px] font-semibold ${value === 0 ? 'text-muted' : 'text-ink'}`}>
          {texts.whatIf.sliders.value(pctText)}
        </output>
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="relative mt-2">
        {/* заливка от нуля до значения */}
        <div aria-hidden className="pointer-events-none absolute inset-x-3 top-1/2 h-1.5 -translate-y-1/2">
          <div className="absolute inset-0 rounded-full bg-line-strong/70" />
          <div
            className="absolute inset-y-0 rounded-full bg-accent"
            style={{ left: `${Math.min(fill, zero)}%`, width: `${Math.abs(fill - zero)}%` }}
          />
          <div className="absolute -inset-y-1.5 w-0.5 -translate-x-1/2 bg-ink/40" style={{ left: `${zero}%` }} />
        </div>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={texts.whatIf.sliders.ariaLabel(label, pctText)}
          className="range relative"
        />
      </div>
      <div className="num flex justify-between text-[11px] text-muted" aria-hidden>
        <span>{formatPct(min, { fractionDigits: 0 })}</span>
        <span>0</span>
        <span>{formatPct(max, { fractionDigits: 0 })}</span>
      </div>
      {valueNote && <p className="num mt-1 text-xs text-ink/75">{valueNote}</p>}
    </div>
  );
}

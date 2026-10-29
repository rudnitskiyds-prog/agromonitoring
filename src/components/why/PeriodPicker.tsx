// Выбор «что с чем сравниваем»: регион, культура, два сезона. Значения живут в query.
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { CROPS, REGIONS } from '../../config/regions';
import { texts } from '../../content/texts';
import type { CropId, RegionId } from '../../types';

const P = texts.why.periods;
const L_REGION = texts.why.regionLabel;

function Field({ id, label, children, className = '' }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative mt-1">
        {children}
        <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
      </div>
    </div>
  );
}

const selectCls =
  'num h-11 w-full appearance-none rounded-control border border-line-strong bg-surface pl-3 pr-8 text-[15px] text-ink hover:border-accent focus:border-accent';

export interface PeriodPickerProps {
  region: RegionId;
  crop: CropId;
  from: number | null;
  to: number | null;
  years: number[];
  onChange: (p: { region?: RegionId; crop?: CropId; from?: number; to?: number }) => void;
}

export default function PeriodPicker({ region, crop, from, to, years, onChange }: PeriodPickerProps) {
  const crops = REGIONS[region]?.crops ?? (Object.keys(CROPS) as CropId[]);
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_auto_minmax(0,0.8fr)] sm:items-end">
      <Field id="why-region" label={L_REGION} className="col-span-2 sm:col-span-1">
        <select id="why-region" className={selectCls} value={region} onChange={(e) => onChange({ region: e.target.value })}>
          {Object.values(REGIONS).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="why-crop" label={texts.common.cropPicker.label} className="col-span-2 sm:col-span-1">
        <select id="why-crop" className={selectCls} value={crop} onChange={(e) => onChange({ crop: e.target.value as CropId })}>
          {crops.map((c) => (
            <option key={c} value={c}>
              {CROPS[c].name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="why-from" label={P.base}>
        <select
          id="why-from"
          className={selectCls}
          value={from ?? ''}
          disabled={!years.length}
          onChange={(e) => onChange({ from: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {P.season(String(y))}
            </option>
          ))}
        </select>
      </Field>
      <button
        type="button"
        onClick={() => from !== null && to !== null && onChange({ from: to, to: from })}
        disabled={from === null || to === null}
        title={P.swap}
        aria-label={P.swap}
        className="col-span-2 row-start-4 inline-flex sm:col-span-1 h-11 items-center justify-center gap-2 self-end rounded-control border border-line-strong bg-surface px-3 text-sm text-ink hover:border-accent hover:text-accent disabled:opacity-50 sm:row-start-auto"
      >
        <ArrowLeftRight size={16} aria-hidden />
        <span className="sm:sr-only">{P.swap}</span>
      </button>
      <Field id="why-to" label={P.current}>
        <select
          id="why-to"
          className={selectCls}
          value={to ?? ''}
          disabled={!years.length}
          onChange={(e) => onChange({ to: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {P.season(String(y))}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

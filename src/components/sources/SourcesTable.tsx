// Таблица источников: строки — показатели из methodology.indicators, статус и дата — из манифеста public/data.
// Ссылка на источник — source_url из одного ряда показателя (в манифесте её нет).
// На телефоне таблица превращается в карточки, без горизонтальной прокрутки.
import { BadgeCheck, ExternalLink } from 'lucide-react';
import { REGIONS } from '../../config/regions';
import { methodology } from '../../content/methodology';
import { texts } from '../../content/texts';
import { formatDate } from '../../lib/format';
import { useSeriesList } from '../../hooks/useData';
import type { DataManifest, Frequency, GeoScope, IndicatorId, SeriesKey } from '../../types';
import { DemoBadge } from '../Badges';

const T = texts.sources.table;
const COLS = T.columns;
const M = methodology.indicators;

const R = texts.sources.rows;

export interface SourceRow {
  id: IndicatorId;
  name: string;
  hint?: string;
  unit: string;
  frequency: string;
  source: string;
  url: string | null;
  updated: string | null;
  demo: boolean;
  regions: string[];
  files: number;
}

const scopeName = (s: GeoScope) => (s === 'russia' ? texts.why.regionCompare.russia : (REGIONS[s]?.name ?? s));

export function useSourceRows(manifest: DataManifest | null): SourceRow[] {
  const files = manifest?.files ?? [];
  const byIndicator = new Map<IndicatorId, DataManifest['files']>();
  for (const f of files) byIndicator.set(f.indicator, [...(byIndicator.get(f.indicator) ?? []), f]);
  // По одному ряду на показатель — ради source_url
  const reps: SeriesKey[] = [...byIndicator.values()].map((fs) => ({
    indicator: fs[0].indicator,
    region: fs[0].region,
    crop: fs[0].crop ?? null,
    frequency: fs[0].frequency,
  }));
  const repState = useSeriesList(reps);
  const urlOf = new Map<IndicatorId, string>();
  if (repState.status === 'ready') for (const s of repState.data) urlOf.set(s.indicator, s.source_url);
  const openMeteoUrl = urlOf.get('precipitation') ?? null;

  const ids: IndicatorId[] = [...M.rows.map((r) => r.id), ...[...byIndicator.keys()].filter((id) => !M.rows.some((r) => r.id === id))];
  return ids.map((id) => {
    const meta = M.rows.find((r) => r.id === id);
    const fs = byIndicator.get(id) ?? [];
    const updated = fs.length ? fs.map((f) => f.updated_at).sort().pop()! : null;
    const regions = [...new Set(fs.map((f) => f.region))].map(scopeName);
    const freq = fs[0]?.frequency as Frequency | undefined;
    return {
      id,
      name: meta?.name ?? id,
      hint: meta?.hint,
      unit: meta?.unit ?? '',
      frequency: meta?.frequency ?? (freq ? T.frequency[freq] : '—'),
      source: meta?.source ?? fs[0]?.source ?? '—',
      url: urlOf.get(id) ?? (meta?.source.includes('Open-Meteo') ? openMeteoUrl : null),
      updated,
      // Статус — по полю demo в манифесте; если ряда в манифесте нет — по методике
      demo: fs.length ? fs.some((f) => f.demo) : !(meta?.real ?? false),
      regions,
      files: fs.length,
    };
  });
}

function Status({ demo }: { demo: boolean }) {
  if (demo) return <DemoBadge size="sm" />;
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-tag border border-accent/40 px-1.5 text-[11px] font-medium text-accent">
      <BadgeCheck size={12} strokeWidth={2} aria-hidden />
      {T.statusReal}
    </span>
  );
}

function SourceLink({ row }: { row: SourceRow }) {
  if (!row.url) return <span>{row.source}</span>;
  return (
    <a href={row.url} target="_blank" rel="noreferrer noopener" className="link [overflow-wrap:anywhere]">
      {row.source}
      <ExternalLink size={12} className="ml-1 inline align-baseline" aria-hidden />
      <span className="sr-only"> — {T.open}</span>
    </a>
  );
}

function Updated({ row }: { row: SourceRow }) {
  if (row.updated) return <span className="num whitespace-nowrap">{formatDate(row.updated, 'long')}</span>;
  return <span title={R.liveHint}>{R.live}</span>;
}

function NameCell({ row }: { row: SourceRow }) {
  return (
    <>
      <span className="font-medium text-ink">{row.name}</span>
      {row.unit && (
        <span className="num ml-2 inline-block rounded-tag border border-line bg-bg px-1.5 text-[11.5px] leading-5 text-ink/80">{row.unit}</span>
      )}
      {row.hint && <span className="mt-0.5 block text-[13px] text-muted">{row.hint}</span>}
      {row.regions.length > 0 && (
        <span className="mt-0.5 block text-[12px] text-muted">
          {R.coverage}: {row.regions.join(', ')} · {R.files(row.files)}
        </span>
      )}
    </>
  );
}

export default function SourcesTable({ rows }: { rows: SourceRow[] }) {
  return (
    <>
      {/* Десктоп/планшет: таблица */}
      <table className="hidden w-full border-collapse text-left text-sm md:table">
        <thead>
          <tr className="border-y border-line-strong text-xs text-muted">
            <th scope="col" className="py-2.5 pr-4 font-medium">{COLS.indicator}</th>
            <th scope="col" className="py-2.5 pr-4 font-medium">{COLS.source}</th>
            <th scope="col" className="py-2.5 pr-4 font-medium">{COLS.frequency}</th>
            <th scope="col" className="py-2.5 pr-4 font-medium">{COLS.updated}</th>
            <th scope="col" className="py-2.5 font-medium">{COLS.status}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="align-top">
              <th scope="row" className="w-[34%] py-3 pr-4 font-normal">
                <NameCell row={r} />
              </th>
              <td className="w-[26%] py-3 pr-4 text-ink/85">
                <SourceLink row={r} />
              </td>
              <td className="py-3 pr-4 text-ink/80">{r.frequency}</td>
              <td className="py-3 pr-4 text-ink/80">
                <Updated row={r} />
              </td>
              <td className="py-3">
                <Status demo={r.demo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Телефон: карточки */}
      <ul className="space-y-gutter md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-card border border-line bg-surface p-card-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-[15px] leading-snug">
                <NameCell row={r} />
              </p>
              <Status demo={r.demo} />
            </div>
            <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-dashed border-line pt-2.5 text-[13px]">
              <dt className="text-muted">{COLS.source}</dt>
              <dd className="min-w-0 text-ink/85">
                <SourceLink row={r} />
              </dd>
              <dt className="text-muted">{COLS.frequency}</dt>
              <dd className="text-ink/85">{r.frequency}</dd>
              <dt className="text-muted">{COLS.updated}</dt>
              <dd className="text-ink/85">
                <Updated row={r} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

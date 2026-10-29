// «Источники и методика» — «Можно ли этому верить?»
// Таблица источников (манифест public/data + methodology.indicators), методика, замена демо-данных, атрибуция.
import { ExternalLink, FlaskConical, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import MethodSection, { SectionShell } from '../components/sources/MethodSection';
import SourcesTable, { useSourceRows } from '../components/sources/SourcesTable';
import { methodology } from '../content/methodology';
import { texts } from '../content/texts';
import { useManifest } from '../hooks/useData';
import { ErrorState, LoadingState, Skeleton } from '../components/States';
import { scrollBehavior } from '../components/why/motion';
import { formatDate } from '../lib/format';

const S = texts.sources;

const SP = S.page;

const ATTRIBUTION = [
  { name: 'Open-Meteo.com', text: SP.openMeteo, url: 'https://open-meteo.com/', extra: { label: SP.openMeteoLicense, url: 'https://creativecommons.org/licenses/by/4.0/' } },
  { name: 'Банк России', text: SP.cbr, url: 'https://www.cbr.ru/hd_base/KeyRate/' },
  { name: 'Росстат / ЕМИСС', text: SP.rosstat, url: 'https://www.fedstat.ru/' },
];

const TOC: Array<{ id: string; title: string }> = [
  { id: 's-table', title: S.table.title },
  ...methodology.sections.map((s) => ({ id: `m-${s.id}`, title: s.question })),
  { id: 's-replace', title: methodology.replaceDemo.title },
  { id: 's-attribution', title: SP.attributionTitle },
];

/** Подсветка раздела оглавления, который сейчас на экране. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '0px 0px -65% 0px' },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

const TOC_IDS = TOC.map((t) => t.id);

export default function SourcesPage() {
  const active = useActiveSection(TOC_IDS);
  let n = 1;

  return (
    <main className="mx-auto max-w-page px-4 pb-section-lg pt-page-top sm:px-6 sm:pt-page-top-lg lg:px-8">
      <header className="max-w-3xl">
        <p className="kicker">{S.meta}</p>
        <h1 className="mt-stack text-[28px] font-semibold leading-[1.1] sm:text-[40px]">{S.title}</h1>
        <p className="mt-stack max-w-prose text-[16px] leading-relaxed text-ink/80 sm:text-[17px]">{S.lead}</p>
      </header>

      {/* Что здесь демо */}
      <aside className="mt-block-lg flex max-w-3xl gap-3 rounded-card border border-dashed border-line-strong bg-surface p-card-sm sm:p-card">
        <FlaskConical size={20} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <div>
          <p className="font-semibold">{S.demoNotice.title}</p>
          <p className="mt-1 text-[15px] leading-relaxed text-ink/80">{S.demoNotice.text}</p>
        </div>
      </aside>

      <div className="mt-block-lg lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-section">
        {/* Оглавление журнала — только десктоп */}
        <nav aria-label={SP.tocLabel} className="hidden lg:block">
          <ol className="sticky top-6 space-y-2.5 border-l border-line pl-4 text-[13px] leading-snug">
            {TOC.map((t, i) => (
              <li key={t.id}>
                <a
                  href={`#/sources`}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(t.id);
                    el?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
                    // Фокус — в раздел, чтобы следующий Tab шёл по его содержимому
                    el?.focus({ preventScroll: true });
                  }}
                  aria-current={active === t.id ? 'location' : undefined}
                  className={`-ml-[17px] flex gap-2 border-l-2 pl-[15px] transition-colors ${
                    active === t.id ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  <span className="num w-5 shrink-0 text-ochre">{String(i + 1).padStart(2, '0')}</span>
                  {t.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-section">
          <SectionShell id="s-table" n={n++} title={S.table.title} lead={methodology.indicators.lead}>
            <SourcesBlock />
          </SectionShell>

          <div>
            <p className="kicker">{methodology.title}</p>
            <p className="mt-2 max-w-prose text-[15px] text-ink/75">{methodology.lead}</p>
          </div>

          {methodology.sections.map((s) => (
            <MethodSection key={s.id} section={s} n={n++} />
          ))}

          <SectionShell id="s-replace" n={n++} title={methodology.replaceDemo.title} lead={methodology.replaceDemo.lead}>
            <ol className="space-y-4">
              {methodology.replaceDemo.steps.map((st, i) => (
                <li key={st.title} className="grid gap-x-4 sm:grid-cols-[72px_minmax(0,1fr)]">
                  <span className="kicker pt-1 !text-ochre">{SP.stepLabel(String(i + 1))}</span>
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-semibold">{st.title}</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink/80">{st.text}</p>
                    {st.command && (
                      <pre className="mt-2 flex items-start gap-2 overflow-hidden rounded-control bg-ink px-3.5 py-2.5 text-[13px] leading-relaxed text-bg">
                        <Terminal size={14} className="mt-[3px] shrink-0 opacity-60" aria-hidden />
                        <code className="min-w-0 whitespace-pre-wrap font-mono [overflow-wrap:anywhere]">{st.command}</code>
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-block flex max-w-[68ch] gap-2.5 text-[14.5px] leading-relaxed text-ink/80">
              <FlaskConical size={16} className="mt-[3px] shrink-0 text-muted" aria-hidden />
              {methodology.replaceDemo.note}
            </p>
          </SectionShell>

          <SectionShell id="s-attribution" n={n++} title={SP.attributionTitle} lead={SP.attributionLead}>
            <ul className="divide-y divide-line border-y border-line">
              {ATTRIBUTION.map((a) => (
                <li key={a.name} className="grid gap-1 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
                  <a href={a.url} target="_blank" rel="noreferrer noopener" className="link font-semibold">
                    {a.name}
                    <ExternalLink size={12} className="ml-1 inline align-baseline" aria-hidden />
                  </a>
                  <p className="text-[15px] text-ink/80">
                    {a.text}
                    {a.extra && (
                      <>
                        {' · '}
                        <a href={a.extra.url} target="_blank" rel="noreferrer noopener" className="link">
                          {a.extra.label}
                        </a>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </SectionShell>
        </div>
      </div>
    </main>
  );
}

// ── Таблица источников с загрузкой манифеста; повтор — перемонтирование по ключу ──
function SourcesBlock() {
  const [attempt, setAttempt] = useState(0);
  return <SourcesBlockInner key={attempt} onRetry={() => setAttempt((n) => n + 1)} />;
}

function SourcesBlockInner({ onRetry }: { onRetry: () => void }) {
  const manifest = useManifest();
  const rows = useSourceRows(manifest.status === 'ready' ? manifest.data : null);
  if (manifest.status === 'loading')
    return (
      <LoadingState label={S.table.loading} framed={false}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={56} />
        ))}
      </LoadingState>
    );
  if (manifest.status === 'error') return <ErrorState message={S.table.empty} onRetry={onRetry} />;
  return (
    <>
      <p className="num -mt-2 mb-stack text-sm text-muted">{S.updated(formatDate(manifest.data.generated_at, 'long'))}</p>
      <SourcesTable rows={rows} />
    </>
  );
}

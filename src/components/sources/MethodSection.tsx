// Секция методики: вопрос → короткий ответ → абзацы → формулы → списки → заметки.
import { Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { texts } from '../../content/texts';
import type { MethodNote, MethodSection as Section } from '../../content/methodology';

// Подпись вида заметки рядом с иконкой — чтобы не полагаться на цвет
const NOTE_KIND: Record<MethodNote['kind'], string> = texts.sources.noteKind;

export function SectionShell({
  id,
  n,
  title,
  lead,
  children,
}: {
  id: string;
  n: number;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} tabIndex={-1} className="scroll-mt-6 border-t border-line pt-block-lg focus:outline-none sm:pt-section">
      <div className="flex items-baseline gap-3">
        <span className="num text-sm font-semibold text-ochre">{String(n).padStart(2, '0')}</span>
        <h2 id={`${id}-h`} className="text-xl leading-tight sm:text-2xl">
          {title}
        </h2>
      </div>
      {lead && <p className="mt-stack max-w-[60ch] text-[17px] leading-relaxed text-ink sm:text-lg">{lead}</p>}
      {children && <div className="mt-block">{children}</div>}
    </section>
  );
}

function Note({ note }: { note: MethodNote }) {
  const warn = note.kind === 'warning';
  const Icon = warn ? TriangleAlert : Info;
  return (
    <aside
      className={`flex gap-3 rounded-card border p-card-sm sm:p-card ${
        warn ? 'border-ochre/60 bg-ochre-soft/60' : 'border-line bg-surface'
      }`}
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${warn ? 'text-ochre' : 'text-accent'}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug">
          <span className={`kicker mr-2 align-[1px] ${warn ? '!text-ochre' : ''}`}>{NOTE_KIND[note.kind]}</span>
          {note.title}
        </p>
        <p className="mt-1 text-[14.5px] leading-relaxed text-ink/80">{note.text}</p>
      </div>
    </aside>
  );
}

export default function MethodSection({ section, n }: { section: Section; n: number }) {
  return (
    <SectionShell id={`m-${section.id}`} n={n} title={section.question} lead={section.lead}>
      <div className="space-y-block">
        {section.paragraphs?.map((p, i) => (
          <p key={i} className="max-w-[68ch] text-[15.5px] leading-relaxed text-ink/85">
            {p}
          </p>
        ))}

        {section.formulas && section.formulas.length > 0 && (
          <dl className="grid gap-gutter lg:grid-cols-2">
            {section.formulas.map((f) => (
              <div key={f.id} className="min-w-0 rounded-card border border-line bg-surface p-card-sm sm:p-card">
                <dt className="text-sm font-semibold text-ink">{f.label}</dt>
                <dd className="mt-2">
                  <code className="block rounded-control border-l-2 border-ochre bg-bg px-3 py-2 font-mono text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]">
                    {f.expression}
                  </code>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink/75">{f.explain}</p>
                </dd>
              </div>
            ))}
          </dl>
        )}

        {section.lists?.map((l, i) => {
          const ListTag = l.ordered ? 'ol' : 'ul';
          return (
            <div key={i}>
              {l.title && <h3 className="text-[15px] font-semibold">{l.title}</h3>}
              <ListTag className={`mt-2 max-w-[68ch] space-y-1.5 text-[15px] leading-relaxed text-ink/85`}>
                {l.items.map((it, j) => (
                  <li key={j} className="flex gap-3">
                    {l.ordered ? (
                      <span className="num mt-px w-5 shrink-0 text-right text-sm font-semibold text-ochre">{j + 1}.</span>
                    ) : (
                      <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                    )}
                    <span className="min-w-0">{it}</span>
                  </li>
                ))}
              </ListTag>
            </div>
          );
        })}

        {section.notes?.map((note, i) => <Note key={i} note={note} />)}
      </div>
    </SectionShell>
  );
}

export { Note as MethodNoteView };

import { ROUTES } from '../routes';

// Заглушка. Страницу делает ui-designer.
export default function SourcesPage() {
  const r = ROUTES.sources;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-2xl">{r.title}</h1>
      <p className="mt-2 text-muted">{r.question}</p>
    </main>
  );
}

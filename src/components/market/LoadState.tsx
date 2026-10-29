// Загрузка и ошибка блока страницы: одинаково на «Рынке» и «Урожае».
import { RotateCw, TriangleAlert } from 'lucide-react';
import { texts } from '../../content/texts';
import Button from '../Button';

export function LoadingBlock({ label = texts.common.loading.chart, height = 280 }: { label?: string; height?: number }) {
  return (
    <div aria-busy="true" className="rounded-card border border-line bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <div className="mt-4 animate-pulse rounded-control bg-surface-2" style={{ height }} />
    </div>
  );
}

export function ErrorBlock({ what }: { what?: string }) {
  return (
    <div role="alert" className="rounded-card border border-line bg-surface p-5">
      <p className="flex items-center gap-2 font-semibold">
        <TriangleAlert size={16} className="text-status-worse" aria-hidden />
        {texts.common.errors.loadTitle}
      </p>
      <p className="mt-1 text-sm text-ink/80">{what ? texts.common.errors.loadSeries(what) : texts.common.errors.load}</p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        iconLeft={<RotateCw size={14} aria-hidden />}
        onClick={() => window.location.reload()}
      >
        {texts.common.actions.retry}
      </Button>
    </div>
  );
}

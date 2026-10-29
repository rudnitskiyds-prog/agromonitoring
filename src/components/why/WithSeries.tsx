// Загрузка рядов для блока drill-down с понятной ошибкой и повтором (перемонтирование по ключу).
import { useState, type ReactNode } from 'react';
import { useSeriesList } from '../../hooks/useData';
import type { DataSeries, SeriesKey } from '../../types';
import { ErrorState } from '../States';

export interface WithSeriesProps {
  keys: SeriesKey[];
  /** Заглушка по форме будущего блока */
  loading: ReactNode;
  errorTitle?: string;
  errorMessage?: string;
  children: (data: DataSeries[]) => ReactNode;
}

export default function WithSeries(props: WithSeriesProps) {
  const [attempt, setAttempt] = useState(0);
  return <Inner key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />;
}

function Inner({ keys, loading, errorTitle, errorMessage, children, onRetry }: WithSeriesProps & { onRetry: () => void }) {
  const state = useSeriesList(keys);
  if (state.status === 'loading') return <>{loading}</>;
  if (state.status === 'error') return <ErrorState title={errorTitle} message={errorMessage} onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}

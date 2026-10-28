// React-обёртка над src/store/farm.ts: профиль хозяйства с подпиской на изменения.
import { useEffect, useState } from 'react';
import { loadFarmProfile, subscribeFarmProfile } from '../store/farm';
import type { LoadedProfile } from '../types';

/** Текущий профиль (сохранённый или демо) и его происхождение; обновляется при сохранении/сбросе. */
export function useFarmProfile(): LoadedProfile {
  const [state, setState] = useState<LoadedProfile>(() => loadFarmProfile());
  useEffect(
    () =>
      subscribeFarmProfile(() => {
        // origin пересчитываем через load: после clear подписчику приходит демо
        setState(loadFarmProfile());
      }),
    [],
  );
  return state;
}

// Профиль хозяйства + localStorage с откатом на демо. Владелец — finance-modeler. Сейчас — заглушки.
import type {
  ClearFarmProfile,
  FarmProfile,
  HasSavedProfile,
  LoadFarmProfile,
  SaveFarmProfile,
  SubscribeFarmProfile,
} from '../types';
import { notImplemented } from '../lib/todo';

const OWNER = 'finance-modeler';

export const STORAGE_KEY = 'agromonitoring.farm.v1';

/** Демо-хозяйство: 1 200 га, Краснодарский край, пшеница + подсолнечник. Заполняет finance-modeler. */
export const DEMO_FARM: FarmProfile | null = null;

export const loadFarmProfile: LoadFarmProfile = () => notImplemented(OWNER, 'loadFarmProfile');
export const saveFarmProfile: SaveFarmProfile = () => notImplemented(OWNER, 'saveFarmProfile');
export const clearFarmProfile: ClearFarmProfile = () => notImplemented(OWNER, 'clearFarmProfile');
export const hasSavedProfile: HasSavedProfile = () => false;
export const subscribeFarmProfile: SubscribeFarmProfile = () => notImplemented(OWNER, 'subscribeFarmProfile');

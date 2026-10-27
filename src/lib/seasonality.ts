// Сезонность цен. Владелец — finance-modeler. Сейчас — заглушки.
import type { BuildSeasonalProfile, SeasonalDeviationFn } from '../types';
import { notImplemented } from './todo';

const OWNER = 'finance-modeler';

export const buildSeasonalProfile: BuildSeasonalProfile = () => notImplemented(OWNER, 'buildSeasonalProfile');
export const seasonalDeviation: SeasonalDeviationFn = () => notImplemented(OWNER, 'seasonalDeviation');

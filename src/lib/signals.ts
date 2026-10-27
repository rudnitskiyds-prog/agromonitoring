// Правила «Что изменилось» и погодные риски. Владелец — finance-modeler. Сейчас — заглушки.
import type { BuildSignals, DetectWeatherRisks, PickAdvice } from '../types';
import { notImplemented } from './todo';

const OWNER = 'finance-modeler';

export const WEATHER_RISK_THRESHOLDS = {
  frostTMin: 0,
  heatTMax: 35,
  dryDayPrecip: 1,
  drySpellDays: 10,
} as const;

export const buildSignals: BuildSignals = () => notImplemented(OWNER, 'buildSignals');
export const pickAdvice: PickAdvice = () => notImplemented(OWNER, 'pickAdvice');
export const detectWeatherRisks: DetectWeatherRisks = () => notImplemented(OWNER, 'detectWeatherRisks');

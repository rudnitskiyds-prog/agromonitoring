// Финансовый слой (раздел 7). Владелец — finance-modeler. Сейчас — заглушки по контрактам из types.ts.
import type {
  ApplyWhatIf,
  ComputeCropEconomics,
  ComputeFarmEconomics,
  FactorAnalysisFn,
  PeriodStateAt,
  Sensitivity,
} from '../types';
import { notImplemented } from './todo';

const OWNER = 'finance-modeler';

export const computeCropEconomics: ComputeCropEconomics = () => notImplemented(OWNER, 'computeCropEconomics');
export const computeFarmEconomics: ComputeFarmEconomics = () => notImplemented(OWNER, 'computeFarmEconomics');
export const factorAnalysis: FactorAnalysisFn = () => notImplemented(OWNER, 'factorAnalysis');
export const periodStateAt: PeriodStateAt = () => notImplemented(OWNER, 'periodStateAt');
export const applyWhatIf: ApplyWhatIf = () => notImplemented(OWNER, 'applyWhatIf');
export const sensitivity: Sensitivity = () => notImplemented(OWNER, 'sensitivity');

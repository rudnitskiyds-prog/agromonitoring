// Помощники по рядам данных. Владелец — finance-modeler. Сейчас — заглушки.
import type { ChangePct, ValueAt } from '../types';
import { notImplemented } from './todo';

const OWNER = 'finance-modeler';

export const valueAt: ValueAt = () => notImplemented(OWNER, 'valueAt');
export const changePct: ChangePct = () => notImplemented(OWNER, 'changePct');

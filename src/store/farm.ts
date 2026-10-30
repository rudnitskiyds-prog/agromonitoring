// Профиль хозяйства + localStorage с откатом на демо. Владелец — finance-modeler.
// Работает и без window (тесты в node): доступ к хранилищу — через globalThis, всё в try/catch.
import type {
  Assumable,
  ClearFarmProfile,
  CostsPerHa,
  CropId,
  CropPlan,
  FarmProfile,
  HasSavedProfile,
  LoadFarmProfile,
  RegionId,
  SaveFarmProfile,
  SubscribeFarmProfile,
} from '../types';
import { REGIONS } from '../config/regions';

export const STORAGE_KEY = 'agromonitoring.farm.v1';
export const PROFILE_VERSION = 1 as const;

const CROP_IDS: CropId[] = ['wheat', 'barley', 'sunflower', 'corn'];

const a = (value: number): Assumable => ({ value, assumption: true });

/**
 * Плановая урожайность по умолчанию, ц/га — среднее Росстата/ЕМИСС за 2022–2024, допущение для плана
 * (public/data/yield_{region}_{crop}_year.json; итогов 2025–2026 в рядах нет).
 * Регион без записи — среднее по России за те же годы. Пользователь правит в онбординге.
 */
export const FALLBACK_YIELD_CHA: Record<string, Record<CropId, number>> = {
  // Кубань: пшеница (67,45 + 56,19 + 63,09) / 3; ячмень; подсолнечник; кукуруза
  krasnodar: { wheat: 62.2, barley: 63.5, sunflower: 24.2, corn: 51.9 },
  saratov: { wheat: 28.7, barley: 17.8, sunflower: 14.9, corn: 53.4 },
  // Россия в среднем — для регионов без своей записи
  default: { wheat: 32.2, barley: 27.0, sunflower: 17.9, corn: 60.4 },
};

function cloneCosts(c: CostsPerHa): CostsPerHa {
  return {
    seeds: { ...c.seeds },
    fertilizers: { ...c.fertilizers },
    plantProtection: { ...c.plantProtection },
    fuelLitersPerHa: { ...c.fuelLitersPerHa },
    other: { ...c.other },
  };
}

/**
 * Затраты по умолчанию — условное допущение. Единственный источник чисел — REGIONS.*.defaultCosts
 * (src/config/regions.ts), своих констант затрат здесь нет.
 * Порядок поиска: регион хозяйства → первый регион в REGIONS, где для культуры есть затраты.
 * Если культуры нет ни в одном регионе — нули (тоже с assumption: true), чтобы пользователь ввёл свои.
 * Все поля всегда assumption: true, даже если в конфиге флаг забыли.
 */
export function defaultCosts(region: RegionId, crop: CropId): CostsPerHa {
  const fromConfig =
    REGIONS[region]?.defaultCosts?.[crop] ??
    Object.values(REGIONS).find((r) => r.defaultCosts?.[crop])?.defaultCosts[crop];
  if (fromConfig) {
    const c = cloneCosts(fromConfig);
    for (const k of Object.keys(c) as Array<keyof CostsPerHa>) c[k].assumption = true;
    return c;
  }
  return { seeds: a(0), fertilizers: a(0), plantProtection: a(0), fuelLitersPerHa: a(0), other: a(0) };
}

/** Плановая урожайность по умолчанию, ц/га — условное допущение. */
export function defaultYieldCha(region: RegionId, crop: CropId): number {
  return (FALLBACK_YIELD_CHA[region] ?? FALLBACK_YIELD_CHA.default)[crop];
}

/** План по культуре со значениями по умолчанию (урожайность и затраты — допущения). */
export function buildDefaultPlan(region: RegionId, crop: CropId, areaHa: number): CropPlan {
  return { crop, areaHa, yieldCha: a(defaultYieldCha(region, crop)), costs: defaultCosts(region, crop) };
}

/**
 * Демо-хозяйство: 1 200 га, Краснодарский край, пшеница 800 га + подсолнечник 400 га
 * (2:1 — типичный для Кубани севооборот с преобладанием озимой пшеницы).
 * Урожайность и затраты — условные допущения.
 */
export const DEMO_FARM: FarmProfile = {
  version: PROFILE_VERSION,
  name: 'Демо-хозяйство',
  region: 'krasnodar',
  crops: [buildDefaultPlan('krasnodar', 'wheat', 800), buildDefaultPlan('krasnodar', 'sunflower', 400)],
  isDemo: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const cloneProfile = (p: FarmProfile): FarmProfile => JSON.parse(JSON.stringify(p)) as FarmProfile;

// ─── Проверка формы ──────────────────────────────────────────────────────────

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isAssumable = (x: unknown): boolean => isObj(x) && isNum(x.value) && x.value >= 0 && typeof x.assumption === 'boolean';

function isCropPlan(x: unknown): boolean {
  if (!isObj(x)) return false;
  if (!CROP_IDS.includes(x.crop as CropId)) return false;
  if (!isNum(x.areaHa) || x.areaHa < 0) return false;
  if (!isAssumable(x.yieldCha)) return false;
  const c = x.costs;
  return (
    isObj(c) &&
    isAssumable(c.seeds) &&
    isAssumable(c.fertilizers) &&
    isAssumable(c.plantProtection) &&
    isAssumable(c.fuelLitersPerHa) &&
    isAssumable(c.other)
  );
}

/** Проверка версии и формы объекта из хранилища. */
export function isFarmProfile(x: unknown): x is FarmProfile {
  return (
    isObj(x) &&
    x.version === PROFILE_VERSION &&
    typeof x.name === 'string' &&
    typeof x.region === 'string' &&
    x.region.length > 0 &&
    typeof x.isDemo === 'boolean' &&
    typeof x.updatedAt === 'string' &&
    Array.isArray(x.crops) &&
    x.crops.length > 0 &&
    x.crops.every(isCropPlan)
  );
}

// ─── Хранилище ───────────────────────────────────────────────────────────────

function storage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch {
    return null; // доступ к localStorage может бросать (приватный режим, запрет cookies)
  }
}

/** Профиль, сохранённый в памяти, если localStorage недоступен: живёт до перезагрузки. */
let memoryProfile: FarmProfile | null = null;

function readStored(): FarmProfile | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isFarmProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const loadFarmProfile: LoadFarmProfile = () => {
  const stored = readStored();
  if (stored) return { profile: stored, origin: 'saved' };
  if (memoryProfile) return { profile: cloneProfile(memoryProfile), origin: 'saved' };
  return { profile: cloneProfile(DEMO_FARM), origin: 'demo' };
};

const listeners = new Set<(p: FarmProfile) => void>();
function emit(p: FarmProfile): void {
  for (const l of [...listeners]) {
    try {
      l(cloneProfile(p));
    } catch {
      // ошибка подписчика не должна ломать сохранение
    }
  }
}

export const saveFarmProfile: SaveFarmProfile = (profile) => {
  if (!isFarmProfile(profile)) return false;
  const copy = cloneProfile(profile);
  memoryProfile = copy;
  let ok = false;
  const s = storage();
  if (s) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(copy));
      ok = true;
    } catch {
      ok = false; // переполнение или запрет записи — профиль останется в памяти
    }
  }
  emit(copy);
  return ok;
};

export const clearFarmProfile: ClearFarmProfile = () => {
  memoryProfile = null;
  const s = storage();
  if (s) {
    try {
      s.removeItem(STORAGE_KEY);
    } catch {
      // нечего делать: хранилище недоступно
    }
  }
  emit(DEMO_FARM);
};

export const hasSavedProfile: HasSavedProfile = () => readStored() !== null || memoryProfile !== null;

// Синхронизация между вкладками: событие storage (только в браузере).
let storageListenerAttached = false;
function onStorage(e: StorageEvent): void {
  if (e.key !== null && e.key !== STORAGE_KEY) return;
  emit(loadFarmProfile().profile);
}

export const subscribeFarmProfile: SubscribeFarmProfile = (listener) => {
  listeners.add(listener);
  const w = (globalThis as { window?: Window }).window;
  if (w && !storageListenerAttached && typeof w.addEventListener === 'function') {
    w.addEventListener('storage', onStorage);
    storageListenerAttached = true;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && w && storageListenerAttached) {
      w.removeEventListener('storage', onStorage);
      storageListenerAttached = false;
    }
  };
};

/** Только для тестов: сбросить состояние модуля. */
export function __resetFarmStoreForTests(): void {
  memoryProfile = null;
  listeners.clear();
}

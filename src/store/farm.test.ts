import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmProfile } from '../types';
import { REGIONS } from '../config/regions';
import {
  __resetFarmStoreForTests,
  buildDefaultPlan,
  clearFarmProfile,
  DEMO_FARM,
  hasSavedProfile,
  isFarmProfile,
  loadFarmProfile,
  saveFarmProfile,
  STORAGE_KEY,
  subscribeFarmProfile,
} from './farm';

class FakeStorage {
  data = new Map<string, string>();
  failWrite = false;
  getItem(k: string) {
    return this.data.has(k) ? (this.data.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.failWrite) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let fake: FakeStorage;
beforeEach(() => {
  fake = new FakeStorage();
  vi.stubGlobal('localStorage', fake);
  __resetFarmStoreForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const myFarm = (): FarmProfile => ({
  ...DEMO_FARM,
  name: 'ООО «Колос»',
  isDemo: false,
  crops: [buildDefaultPlan('saratov', 'wheat', 2000)],
  updatedAt: '2026-10-28T08:00:00Z',
});

describe('DEMO_FARM и допущения', () => {
  it('1 200 га, Кубань, пшеница 800 + подсолнечник 400', () => {
    expect(DEMO_FARM.isDemo).toBe(true);
    expect(DEMO_FARM.region).toBe('krasnodar');
    expect(DEMO_FARM.crops.map((c) => [c.crop, c.areaHa])).toEqual([
      ['wheat', 800],
      ['sunflower', 400],
    ]);
    expect(isFarmProfile(DEMO_FARM)).toBe(true);
  });
  it('плановая урожайность — среднее Росстата за 2022–2024', () => {
    expect(DEMO_FARM.crops[0].yieldCha.value).toBeCloseTo((67.45 + 56.19 + 63.09) / 3, 1);
    expect(DEMO_FARM.crops[1].yieldCha.value).toBeCloseTo((25.66 + 27.62 + 19.3) / 3, 1);
  });
  it('урожайность и все затраты помечены как допущения', () => {
    for (const c of DEMO_FARM.crops) {
      expect(c.yieldCha.assumption).toBe(true);
      for (const v of Object.values(c.costs)) expect(v.assumption).toBe(true);
    }
  });
  it('buildDefaultPlan — затраты берутся из regions.ts: регион, иначе первый регион с культурой', () => {
    const own = REGIONS.krasnodar?.defaultCosts?.wheat;
    if (own) expect(buildDefaultPlan('krasnodar', 'wheat', 1).costs.seeds.value).toBe(own.seeds.value);
    const firstCorn = Object.values(REGIONS).find((r) => r.defaultCosts?.corn)?.defaultCosts.corn;
    const p = buildDefaultPlan('nowhere', 'corn', 100);
    expect(p.costs.seeds.value).toBe(firstCorn ? firstCorn.seeds.value : 0);
    expect(p.costs.fuelLitersPerHa.value).toBe(firstCorn ? firstCorn.fuelLitersPerHa.value : 0);
    for (const v of Object.values(p.costs)) expect(v.assumption).toBe(true);
    expect(p.yieldCha.value).toBeGreaterThan(0);
    expect(p.yieldCha.assumption).toBe(true);
  });
  it('buildDefaultPlan не делит объекты с конфигом', () => {
    const a = buildDefaultPlan('krasnodar', 'wheat', 1);
    a.costs.seeds.value = 1;
    expect(buildDefaultPlan('krasnodar', 'wheat', 1).costs.seeds.value).not.toBe(1);
  });
});

describe('load / save / clear', () => {
  it('пусто → демо', () => {
    const r = loadFarmProfile();
    expect(r.origin).toBe('demo');
    expect(r.profile).toEqual(DEMO_FARM);
    expect(r.profile).not.toBe(DEMO_FARM); // копия, мутация не портит демо
    expect(hasSavedProfile()).toBe(false);
  });
  it('save → load возвращает сохранённое', () => {
    expect(saveFarmProfile(myFarm())).toBe(true);
    const r = loadFarmProfile();
    expect(r.origin).toBe('saved');
    expect(r.profile.name).toBe('ООО «Колос»');
    expect(hasSavedProfile()).toBe(true);
  });
  it('битый JSON → демо', () => {
    fake.data.set(STORAGE_KEY, '{не json');
    expect(loadFarmProfile().origin).toBe('demo');
    expect(hasSavedProfile()).toBe(false);
  });
  it('чужая версия или форма → демо', () => {
    fake.data.set(STORAGE_KEY, JSON.stringify({ ...myFarm(), version: 2 }));
    expect(loadFarmProfile().origin).toBe('demo');
    fake.data.set(STORAGE_KEY, JSON.stringify({ ...myFarm(), crops: [{ crop: 'rice', areaHa: 1 }] }));
    expect(loadFarmProfile().origin).toBe('demo');
    fake.data.set(STORAGE_KEY, JSON.stringify(null));
    expect(loadFarmProfile().origin).toBe('demo');
  });
  it('невалидный профиль не сохраняется', () => {
    expect(saveFarmProfile({ ...myFarm(), crops: [] })).toBe(false);
    expect(fake.data.size).toBe(0);
  });
  it('clear → демо', () => {
    saveFarmProfile(myFarm());
    clearFarmProfile();
    expect(loadFarmProfile().origin).toBe('demo');
    expect(fake.data.has(STORAGE_KEY)).toBe(false);
  });
  it('запись падает → false, профиль живёт в памяти', () => {
    fake.failWrite = true;
    expect(saveFarmProfile(myFarm())).toBe(false);
    expect(loadFarmProfile().profile.name).toBe('ООО «Колос»');
  });
  it('доступ к localStorage бросает → демо', () => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    try {
      expect(loadFarmProfile().origin).toBe('demo');
      expect(saveFarmProfile(myFarm())).toBe(false);
      expect(hasSavedProfile()).toBe(true); // в памяти
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
  it('без localStorage вообще (node) — демо', () => {
    vi.unstubAllGlobals();
    expect(loadFarmProfile().origin).toBe('demo');
  });
});

describe('subscribe', () => {
  it('уведомляет о save и clear, отписка работает', () => {
    const got: string[] = [];
    const off = subscribeFarmProfile((p) => got.push(p.name));
    saveFarmProfile(myFarm());
    clearFarmProfile();
    off();
    saveFarmProfile(myFarm());
    expect(got).toEqual(['ООО «Колос»', 'Демо-хозяйство']);
  });
});

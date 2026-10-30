import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataSeries } from '../types';

const series = (region: string): DataSeries => ({
  indicator: 'diesel_price',
  region,
  crop: null,
  unit: 'руб./л',
  source: 'Росстат',
  source_url: 'https://rosstat.gov.ru/',
  updated_at: '2026-10-26',
  frequency: 'week',
  demo: false,
  series: [{ date: '2026-10-26', value: 86.52 }],
});

const manifest = (files: string[]) => ({
  generated_at: '2026-10-30T00:00:00Z',
  files: files.map((file) => ({ file, indicator: 'diesel_price', region: 'x', crop: null, frequency: 'week', demo: false, source: '', updated_at: '' })),
});

function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const name = String(url).split('/').pop() as string;
    if (name in routes) return { ok: true, status: 200, json: async () => routes[name] } as Response;
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('loadSeries: фолбэк дизеля на ряд по РФ', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it('региона нет в index.json -> diesel_price_russia_week с region russia', async () => {
    mockFetch({
      'index.json': manifest(['diesel_price_russia_week.json']),
      'diesel_price_russia_week.json': series('russia'),
    });
    const { loadSeries } = await import('./data');
    const s = await loadSeries({ indicator: 'diesel_price', region: 'krasnodar', crop: null, frequency: 'week' });
    expect(s.region).toBe('russia');
    expect(s.series[0].value).toBe(86.52);
  });

  it('региональный файл есть в index.json -> грузится он', async () => {
    mockFetch({
      'index.json': manifest(['diesel_price_krasnodar_week.json', 'diesel_price_russia_week.json']),
      'diesel_price_krasnodar_week.json': series('krasnodar'),
      'diesel_price_russia_week.json': series('russia'),
    });
    const { loadSeries } = await import('./data');
    const s = await loadSeries({ indicator: 'diesel_price', region: 'krasnodar', crop: null, frequency: 'week' });
    expect(s.region).toBe('krasnodar');
  });

  it('манифест недоступен, регионального файла нет -> всё равно ряд по РФ', async () => {
    mockFetch({ 'diesel_price_russia_week.json': series('russia') });
    const { loadSeries } = await import('./data');
    const s = await loadSeries({ indicator: 'diesel_price', region: 'saratov', crop: null, frequency: 'week' });
    expect(s.region).toBe('russia');
  });

  it('другие показатели без фолбэка: нет файла -> понятная ошибка', async () => {
    mockFetch({ 'index.json': manifest([]) });
    const { loadSeries } = await import('./data');
    await expect(loadSeries({ indicator: 'yield', region: 'krasnodar', crop: 'wheat', frequency: 'year' })).rejects.toThrow(/404/);
  });
});

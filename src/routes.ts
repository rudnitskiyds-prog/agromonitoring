// Карта сайта (раздел 4 CLAUDE.md). Единый список для роутера и навигации.
import type { CropId, RegionId } from './types';

export interface RouteInfo {
  path: string;
  title: string;
  question: string;
}

export const ROUTES = {
  home: { path: '/', title: 'Главная', question: 'Что это и зачем мне?' },
  farm: { path: '/farm', title: 'Моё хозяйство', question: 'Как описать себя?' },
  today: { path: '/today', title: 'Мой бизнес сегодня', question: 'Как рынок повлиял на меня?' },
  market: { path: '/market', title: 'Рынок и сезонность', question: 'Выгодно ли продавать сейчас?' },
  harvest: { path: '/harvest', title: 'Урожай и погода', question: 'Чего ждать от урожая?' },
  whatIf: { path: '/what-if', title: 'Что если', question: 'Что будет, если…?' },
  why: { path: '/why', title: 'Почему изменилась прибыль', question: 'Из-за чего?' },
  sources: { path: '/sources', title: 'Источники и методика', question: 'Можно ли этому верить?' },
} as const satisfies Record<string, RouteInfo>;

export type RouteId = keyof typeof ROUTES;

// ─────────────────────────────────────────────────────────────────────────────
// Ссылки с параметрами для сценариев С1–С3 (раздел 5 CLAUDE.md).
// Параметры живут в query внутри hash: /#/what-if?crop=wheat&pricePct=6.
// Страница читает их через readParams(useLocation().search, ...); без параметров — значения из профиля.
// ─────────────────────────────────────────────────────────────────────────────


type Params = Record<string, string | number | undefined | null>;

function withQuery(path: string, params: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** «Рынок и сезонность». focus — к какому графику прокрутить (С1: клик по «Солярке» → focus=diesel). */
export const marketLink = (p: { crop?: CropId; region?: RegionId; focus?: 'price' | 'diesel' } = {}) =>
  withQuery(ROUTES.market.path, p);

/** «Урожай и погода» для региона и культуры. */
export const harvestLink = (p: { crop?: CropId; region?: RegionId } = {}) => withQuery(ROUTES.harvest.path, p);

/**
 * «Что если». pricePct/yieldPct/dieselPct — стартовые сдвиги слайдеров в процентах (−30…30).
 * С2: из «Рынка» переходим с отклонением цены от нормы, например pricePct=6.
 */
export const whatIfLink = (p: { crop?: CropId; pricePct?: number; yieldPct?: number; dieselPct?: number } = {}) =>
  withQuery(ROUTES.whatIf.path, p);

/**
 * «Почему изменилась прибыль». from/to — годы сезонов; step — шаг drill-down
 * (indicator → dynamics → region → factor). С3: region=saratov, crop=sunflower, from=2025, to=2026.
 */
export const whyLink = (
  p: { crop?: CropId; region?: RegionId; from?: number; to?: number; factor?: 'price' | 'yield' | 'diesel' | 'otherCosts'; step?: 'indicator' | 'dynamics' | 'region' | 'factor' } = {},
) => withQuery(ROUTES.why.path, p);

/** «Мой бизнес сегодня». period — сравнение «за месяц» или «к прошлому году»; crop — культура карточек факторов. */
export const todayLink = (p: { period?: 'month' | 'year'; crop?: CropId } = {}) => withQuery(ROUTES.today.path, p);

/** Разбор query-строки из useLocation().search: строки как есть, числа — через toNumber. */
export function readParams(search: string): { get: (k: string) => string | null; num: (k: string) => number | null } {
  const q = new URLSearchParams(search);
  return {
    get: (k) => q.get(k),
    num: (k) => {
      const v = q.get(k);
      if (v === null || v.trim() === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    },
  };
}

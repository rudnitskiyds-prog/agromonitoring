// Карта сайта (раздел 4 CLAUDE.md). Единый список для роутера и навигации.
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

import { Component, lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ROUTES } from './routes';
import AppShell from './components/AppShell';
import HomePage from './pages/HomePage';
import { hasSavedProfile } from './store/farm';
import { texts } from './content/texts';
import { ErrorState } from './components/States';

// После нового деплоя у открытой старой вкладки имена чанков устаревают, и подгрузка страницы падает.
// Тогда один раз перезагружаем сайт, чтобы взять свежий index.html; флаг в sessionStorage не даёт
// уйти в цикл перезагрузок, если сеть действительно недоступна (дальше — обычная ошибка).
const RELOAD_FLAG = 'agromonitoring.chunkReload';

function lazyPage<T extends { default: ComponentType }>(load: () => Promise<T>) {
  return lazy(() =>
    load().then(
      (mod) => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
        } catch {
          // хранилище недоступно — не мешает показать страницу
        }
        return mod;
      },
      (err: unknown) => {
        let reloaded = true;
        try {
          reloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
          if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, '1');
        } catch {
          // без sessionStorage не рискуем бесконечной перезагрузкой
        }
        if (!reloaded) {
          window.location.reload();
          return new Promise<T>(() => {});
        }
        throw err;
      },
    ),
  );
}

// Главная грузится сразу; остальные страницы (с Recharts) — отдельными чанками по требованию.
const FarmPage = lazyPage(() => import('./pages/FarmPage'));
const TodayPage = lazyPage(() => import('./pages/TodayPage'));
const MarketPage = lazyPage(() => import('./pages/MarketPage'));
const HarvestPage = lazyPage(() => import('./pages/HarvestPage'));
const WhatIfPage = lazyPage(() => import('./pages/WhatIfPage'));
const WhyPage = lazyPage(() => import('./pages/WhyPage'));
const SourcesPage = lazyPage(() => import('./pages/SourcesPage'));
const StyleguidePage = lazyPage(() => import('./pages/StyleguidePage'));

/** Если страница так и не загрузилась (сеть, устаревший деплой) — сообщение вместо пустого экрана. */
class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-page px-4 pt-page-top sm:pt-page-top-lg">
        <ErrorState onRetry={() => window.location.reload()} />
      </main>
    );
  }
}

/** Сбрасывает ошибку при переходе на другую страницу: сбой одной не блокирует остальные. */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <PageErrorBoundary key={pathname}>{children}</PageErrorBoundary>;
}

function PageLoading() {
  return (
    <main className="mx-auto max-w-page px-4 py-16 text-muted" aria-busy="true">
      {texts.common.loading.default}
    </main>
  );
}

// Повторный визит: если сайт открыт с главной и профиль уже сохранён — сразу «Мой бизнес сегодня».
// Адрес меняется один раз при загрузке модуля, до первого рендера (без побочных эффектов в рендере,
// поэтому StrictMode не мешает), и переход на главную по логотипу дальше работает как обычно.
if (typeof window !== 'undefined' && ['', '#', '#/'].includes(window.location.hash) && hasSavedProfile()) {
  window.history.replaceState(window.history.state, '', `#${ROUTES.today.path}`);
}

export default function App() {
  return (
    <HashRouter>
      <AppShell>
        <RouteErrorBoundary>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path={ROUTES.home.path} element={<HomePage />} />
              <Route path={ROUTES.farm.path} element={<FarmPage />} />
              <Route path={ROUTES.today.path} element={<TodayPage />} />
              <Route path={ROUTES.market.path} element={<MarketPage />} />
              <Route path={ROUTES.harvest.path} element={<HarvestPage />} />
              <Route path={ROUTES.whatIf.path} element={<WhatIfPage />} />
              <Route path={ROUTES.why.path} element={<WhyPage />} />
              <Route path={ROUTES.sources.path} element={<SourcesPage />} />
              <Route path="/styleguide" element={<StyleguidePage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </AppShell>
    </HashRouter>
  );
}

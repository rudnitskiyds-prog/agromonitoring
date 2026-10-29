import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { ROUTES } from './routes';
import AppShell from './components/AppShell';
import HomePage from './pages/HomePage';
import { hasSavedProfile } from './store/farm';
import { texts } from './content/texts';

// Главная грузится сразу; остальные страницы (с Recharts) — отдельными чанками по требованию.
const FarmPage = lazy(() => import('./pages/FarmPage'));
const TodayPage = lazy(() => import('./pages/TodayPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const HarvestPage = lazy(() => import('./pages/HarvestPage'));
const WhatIfPage = lazy(() => import('./pages/WhatIfPage'));
const WhyPage = lazy(() => import('./pages/WhyPage'));
const SourcesPage = lazy(() => import('./pages/SourcesPage'));
const StyleguidePage = lazy(() => import('./pages/StyleguidePage'));

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
      </AppShell>
    </HashRouter>
  );
}

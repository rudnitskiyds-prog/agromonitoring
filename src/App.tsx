import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ROUTES } from './routes';
import AppShell from './components/AppShell';
import HomePage from './pages/HomePage';
import FarmPage from './pages/FarmPage';
import TodayPage from './pages/TodayPage';
import MarketPage from './pages/MarketPage';
import HarvestPage from './pages/HarvestPage';
import WhatIfPage from './pages/WhatIfPage';
import WhyPage from './pages/WhyPage';
import SourcesPage from './pages/SourcesPage';
import StyleguidePage from './pages/StyleguidePage';
import { hasSavedProfile } from './store/farm';

// Повторный визит: если сайт открыт с главной и профиль уже сохранён — сразу «Мой бизнес сегодня».
// Решение принимается один раз при загрузке, поэтому переход на главную по логотипу работает как обычно.
const openedAtRoot = typeof window === 'undefined' || ['', '#', '#/'].includes(window.location.hash);
const returningFarmer = openedAtRoot && hasSavedProfile();

export default function App() {
  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path={ROUTES.home.path} element={<HomeRoute />} />
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
      </AppShell>
    </HashRouter>
  );
}

let redirectDone = false;

function HomeRoute() {
  if (returningFarmer && !redirectDone) {
    redirectDone = true;
    return <Navigate to={ROUTES.today.path} replace />;
  }
  return <HomePage />;
}

import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { ROUTES } from './routes';
import HomePage from './pages/HomePage';
import FarmPage from './pages/FarmPage';
import TodayPage from './pages/TodayPage';
import MarketPage from './pages/MarketPage';
import HarvestPage from './pages/HarvestPage';
import WhatIfPage from './pages/WhatIfPage';
import WhyPage from './pages/WhyPage';
import SourcesPage from './pages/SourcesPage';

// TODO(ui-designer): шапка и мобильное меню вместо временной навигации.
// TODO(оркестратор): при сохранённом профиле открывать /today (store/farm.ts → hasSavedProfile).
export default function App() {
  return (
    <HashRouter>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-sm">
        {Object.values(ROUTES).map((r) => (
          <NavLink key={r.path} to={r.path} end className={({ isActive }) => (isActive ? 'text-accent' : 'text-muted')}>
            {r.title}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route path={ROUTES.home.path} element={<HomePage />} />
        <Route path={ROUTES.farm.path} element={<FarmPage />} />
        <Route path={ROUTES.today.path} element={<TodayPage />} />
        <Route path={ROUTES.market.path} element={<MarketPage />} />
        <Route path={ROUTES.harvest.path} element={<HarvestPage />} />
        <Route path={ROUTES.whatIf.path} element={<WhatIfPage />} />
        <Route path={ROUTES.why.path} element={<WhyPage />} />
        <Route path={ROUTES.sources.path} element={<SourcesPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
    </HashRouter>
  );
}

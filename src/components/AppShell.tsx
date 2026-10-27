import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '../routes';

// Заглушка. Шапку, мобильное меню и переключатель темы делает ui-designer.
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-sm">
        {Object.values(ROUTES).map((r) => (
          <NavLink key={r.path} to={r.path} end className={({ isActive }) => (isActive ? 'text-accent' : 'text-muted')}>
            {r.title}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}

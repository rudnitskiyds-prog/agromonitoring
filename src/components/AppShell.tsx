import { Menu, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ROUTES } from '../routes';
import { texts } from '../content/texts';
import ThemeToggle from './ThemeToggle';

const C = texts.common;
const L_MENU = 'Меню'; // TODO(copywriter): короткая подпись кнопки меню (aria — nav.menuOpen)
const L_CLOSE = C.actions.close;

const NAV = Object.values(ROUTES).filter((r) => r.path !== ROUTES.home.path);

/** Знак: три борозды в квадрате поля. */
function Mark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <rect x="1" y="1" width="26" height="26" rx="6" className="fill-accent" />
      <path d="M6 19c4-1.6 12-1.6 16 0M6 14c4-1.6 12-1.6 16 0M6 9c4-1.6 12-1.6 16 0" className="stroke-accent-ink" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link to={ROUTES.home.path} className="group inline-flex items-center gap-2.5" aria-label="Агромониторинг — на главную">
      <Mark className="h-7 w-7 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-semibold tracking-tight text-ink">
          Агро<span className="text-accent">мониторинг</span>
        </span>
        <span className="mt-1 hidden text-[11px] text-muted sm:block">{C.appTagline}</span>
      </span>
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
      >
        {C.skipToContent}
      </a>
      <header className="relative z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Wordmark />
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-control border border-line-strong px-3 text-sm font-medium text-ink lg:hidden"
              aria-expanded={open}
              aria-label={open ? C.nav.menuClose : C.nav.menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
              <span aria-hidden>{open ? L_CLOSE : L_MENU}</span>
            </button>
          </div>
        </div>

        {/* Десктоп: закладки журнала */}
        <nav aria-label={C.nav.mainLabel} className="mx-auto hidden max-w-page px-4 sm:px-6 lg:block lg:px-8">
          <ul className="-mb-px flex gap-7">
            {NAV.map((r) => (
              <li key={r.path}>
                <NavLink
                  to={r.path}
                  end
                  title={r.question}
                  className={({ isActive }) =>
                    `block whitespace-nowrap border-b-2 pb-3 pt-1 text-[14px] transition-colors ${
                      isActive ? 'border-accent font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
                    }`
                  }
                >
                  {r.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Телефон и планшет: раскрывающееся меню — каждый раздел со своим вопросом */}
        {open && (
          <nav
            id="mobile-nav"
            aria-label={C.nav.mainLabel}
            className="absolute inset-x-0 top-full border-b border-line bg-surface shadow-pop lg:hidden"
          >
            <ul className="mx-auto max-w-page divide-y divide-line px-4 sm:px-6">
              {Object.values(ROUTES).map((r) => (
                <li key={r.path}>
                  <NavLink to={r.path} end className="flex items-baseline justify-between gap-4 py-3">
                    {({ isActive }) => (
                      <>
                        <span className={`shrink-0 text-[15px] ${isActive ? 'font-semibold text-accent' : 'text-ink'}`}>{r.title}</span>
                        <span className="text-right text-xs text-muted">{r.question}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mx-auto flex max-w-page items-center justify-between px-4 py-3 sm:hidden">
              <span className="text-sm text-muted">{C.theme.label}</span>
              <ThemeToggle />
            </div>
          </nav>
        )}
      </header>

      <div id="main" className="flex-1">
        {children}
      </div>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-page flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>{C.footer.note}</p>
          <Link to={ROUTES.sources.path} className="link">
            {ROUTES.sources.title}
          </Link>
        </div>
      </footer>
    </div>
  );
}

// Тема: data-theme на <html>; выбор пользователя в localStorage, иначе — системная.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
/** system — следовать prefers-color-scheme */
export type ThemeChoice = Theme | 'system';

export const THEME_STORAGE_KEY = 'agromonitoring.theme';

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function writeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* приватный режим — тема живёт до перезагрузки */
  }
}

const mql = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function systemTheme(): Theme {
  return mql()?.matches ? 'dark' : 'light';
}

function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Текущая тема документа (для компонентов, которым нужны вычисленные цвета). */
function subscribeDocTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => obs.disconnect();
}
function getDocTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
export function useDocumentTheme(): Theme {
  return useSyncExternalStore(subscribeDocTheme, getDocTheme, () => 'light');
}

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const theme = useDocumentTheme();

  useEffect(() => {
    apply(choice === 'system' ? systemTheme() : choice);
    if (choice !== 'system') return;
    const m = mql();
    if (!m) return;
    const onChange = () => apply(systemTheme());
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    writeChoice(c);
    setChoiceState(c);
  }, []);

  return { theme, choice, setChoice };
}

/**
 * Значение CSS-переменной токена как цвет `rgb(r g b)` — для SVG Recharts,
 * где var() в атрибутах ненадёжен. Пересчитывается при смене темы.
 */
export function useTokenColors<K extends string>(vars: Record<K, string>): Record<K, string> {
  const theme = useDocumentTheme();
  const key = JSON.stringify(vars);
  const [colors, setColors] = useState<Record<K, string>>(() => resolve(vars));
  useEffect(() => {
    setColors(resolve(vars));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, key]);
  return colors;
}

function resolve<K extends string>(vars: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>;
  const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  for (const k of Object.keys(vars) as K[]) {
    const name = vars[k].startsWith('--') ? vars[k] : `--${vars[k]}`;
    const raw = cs?.getPropertyValue(name).trim();
    out[k] = raw ? `rgb(${raw})` : 'currentColor';
  }
  return out;
}

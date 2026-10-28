import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeChoice } from './theme';

import { texts } from '../content/texts';

const T = texts.common.theme;
const OPTIONS: Array<{ id: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { id: 'light', label: T.light, Icon: Sun },
  { id: 'system', label: T.system, Icon: Monitor },
  { id: 'dark', label: T.dark, Icon: Moon },
];

/** Переключатель темы: светлая / как в системе / тёмная. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { choice, setChoice } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label={T.label}
      className={`inline-flex items-center rounded-control border border-line bg-surface-2/60 p-0.5 ${className}`}
    >
      {OPTIONS.map(({ id, label, Icon }) => {
        const active = choice === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(id)}
            className={`grid h-8 w-8 place-items-center rounded-[4px] transition-colors ${
              active ? 'bg-surface text-ink shadow-lift' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon size={16} strokeWidth={1.75} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

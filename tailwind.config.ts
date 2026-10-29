import type { Config } from 'tailwindcss';

// Значения токенов — в src/styles/index.css (раздел 8 CLAUDE.md); здесь привязка имён к CSS-переменным.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const shadow = (a: number) => `rgb(var(--shadow-color) / ${a})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        'line-strong': token('line-strong'),
        grid: token('grid'),
        accent: token('accent'),
        'accent-strong': token('accent-strong'),
        'accent-ink': token('accent-ink'),
        'accent-soft': token('accent-soft'),
        ochre: token('ochre'),
        'ochre-soft': token('ochre-soft'),
        'status-worse': token('status-worse'),
        'status-normal': token('status-normal'),
        'status-better': token('status-better'),
        'status-worse-bg': token('status-worse-bg'),
        'status-normal-bg': token('status-normal-bg'),
        'status-better-bg': token('status-better-bg'),
        'crop-wheat': token('crop-wheat'),
        'crop-barley': token('crop-barley'),
        'crop-sunflower': token('crop-sunflower'),
        'crop-corn': token('crop-corn'),
        'series-diesel': token('series-diesel'),
        'series-other': token('series-other'),
      },
      fontFamily: {
        display: ['Unbounded', '"Golos Text"', 'system-ui', 'sans-serif'],
        sans: ['"Golos Text"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      // Радиусы по уровню: метка → кнопка → карточка → крупный блок. Не одинаковые на всём.
      borderRadius: {
        tag: '3px',
        control: '6px',
        card: '10px',
        sheet: '18px',
      },
      // Тени по уровню: плоская карточка без тени, приподнятая — лёгкая, всплывающее — заметная.
      boxShadow: {
        lift: `0 1px 0 ${shadow(0.04)}, 0 2px 6px -2px ${shadow(0.12)}`,
        raise: `0 1px 0 ${shadow(0.05)}, 0 10px 24px -12px ${shadow(0.28)}`,
        pop: `0 18px 40px -16px ${shadow(0.4)}, 0 2px 6px ${shadow(0.1)}`,
      },
      maxWidth: {
        page: '1200px',
      },
    },
  },
  plugins: [],
} satisfies Config;

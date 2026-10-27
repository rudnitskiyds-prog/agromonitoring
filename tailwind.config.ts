import type { Config } from 'tailwindcss';

// Каркас. Значения токенов задаёт ui-designer в src/styles/index.css (раздел 8 CLAUDE.md);
// здесь только привязка имён к CSS-переменным.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        ink: token('ink'),
        muted: token('muted'),
        line: token('line'),
        accent: token('accent'),
        ochre: token('ochre'),
        'status-worse': token('status-worse'),
        'status-normal': token('status-normal'),
        'status-better': token('status-better'),
        'crop-wheat': token('crop-wheat'),
        'crop-barley': token('crop-barley'),
        'crop-sunflower': token('crop-sunflower'),
        'crop-corn': token('crop-corn'),
      },
      fontFamily: {
        display: ['Unbounded', 'Golos Text', 'system-ui', 'sans-serif'],
        sans: ['"Golos Text"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;

import { expect, test } from '@playwright/test';
import { ROUTES } from '../src/routes';
import { DEMO_FARM, STORAGE_KEY } from '../src/store/farm';

// Повторный визит: с сохранённым профилем сайт открывается на «Мой бизнес сегодня», без профиля — на главной.
test('без профиля открывается главная', async ({ page }) => {
  await page.goto('/');
  await expect(page).not.toHaveURL(new RegExp(`#${ROUTES.today.path}$`));
});

test('с сохранённым профилем открывается «Мой бизнес сегодня»', async ({ page }) => {
  const saved = JSON.stringify({ ...DEMO_FARM, isDemo: false, name: 'Моё хозяйство' });
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, saved] as const);
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`#${ROUTES.today.path}$`));
});

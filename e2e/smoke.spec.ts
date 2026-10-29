import { expect, test } from '@playwright/test';
import { ROUTES } from '../src/routes';

// Все 8 страниц открываются: есть непустой h1 (на страницах это вопрос пользователя или тезис),
// нет ошибок JavaScript и нет горизонтальной прокрутки.
for (const r of Object.values(ROUTES)) {
  test(`страница «${r.title}» открывается`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/#${r.path}`);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).not.toHaveText('');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

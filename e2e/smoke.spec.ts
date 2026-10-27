import { expect, test } from '@playwright/test';
import { ROUTES } from '../src/routes';

// Все 8 страниц открываются и показывают свой заголовок.
for (const r of Object.values(ROUTES)) {
  test(`страница «${r.title}» открывается`, async ({ page }) => {
    await page.goto(`/#${r.path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(r.title);
  });
}

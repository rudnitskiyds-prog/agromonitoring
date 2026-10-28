import { expect, test } from '@playwright/test';
import { ROUTES } from '../src/routes';
import { texts } from '../src/content/texts';

// Все 8 страниц открываются и показывают свой заголовок.
// У главной h1 — тезис, у остальных пока название страницы.
const expectedH1 = (path: string, title: string) => (path === ROUTES.home.path ? texts.home.hero.title : title);

for (const r of Object.values(ROUTES)) {
  test(`страница «${r.title}» открывается`, async ({ page }) => {
    await page.goto(`/#${r.path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(expectedH1(r.path, r.title));
  });
}

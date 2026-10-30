import { expect, test, type Page } from '@playwright/test';
import { DEMO_FARM, STORAGE_KEY } from '../src/store/farm';

// Сценарии С1–С3 из раздела 5 CLAUDE.md — кликами, как фермер.
// Числа — из реальных рядов Росстата/ЕМИСС в public/data (обновлены 23–26.10.2026).
// После очередного запуска scripts/collect.py суммы могут сдвинуться — тогда обновить ожидания.

/**
 * Фраза с числами в русском формате: пробелы-разделители могут быть обычными или неразрывными,
 * после «/» в единицах бывает невидимый соединитель U+2060.
 */
const num = (s: string) =>
  new RegExp(
    s
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/ /g, '[\\s\\u00a0\\u202f]')
      .replace(/−/g, '[−-]')
      .replace(/\//g, '/\\u2060?'),
  );

const main = (page: Page) => page.locator('main');

test('С1 «Утро понедельника»: повторный визит → итог в рублях → солярка', async ({ page }) => {
  const saved = JSON.stringify({ ...DEMO_FARM, isDemo: false, name: 'Моё хозяйство' });
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, saved] as const);

  await page.goto('/');
  await expect(page).toHaveURL(/#\/today/);
  await expect(main(page)).toContainText('За месяц прибыль с гектара пшеницы');
  // Солярка по России за месяц подешевела на ~1%; цены за октябрь Росстат ещё не опубликовал
  await expect(main(page)).toContainText(num('солярка −1% (+53 ₽/га)'));
  await expect(main(page)).toContainText('Росстат ещё не опубликовал цены за октябрь');

  await page.locator('main a[href*="focus=diesel"]').first().click();
  await expect(page).toHaveURL(/#\/market\?.*focus=diesel/);
  await expect(main(page)).toContainText(/солярк/i);
  await expect(main(page)).toContainText('в среднем по России');
  await expect(main(page)).toContainText(num('₽/т'));
});

test('С2 «Продавать сейчас или ждать?»: рынок → цена против нормы → «Что если»', async ({ page }) => {
  await page.goto('/#/market');
  // Реальная цена пшеницы Кубани за сентябрь 2026 ниже обычной для месяца
  await expect(main(page)).toContainText('Ниже обычного');
  await expect(main(page)).toContainText(/ниже обычной для сентября/);

  const toWhatIf = page.locator('main a[href*="what-if"][href*="pricePct="]').first();
  const href = (await toWhatIf.getAttribute('href')) ?? '';
  const pricePct = Number(new URLSearchParams(href.split('?')[1]).get('pricePct'));
  expect(pricePct).toBeGreaterThan(0); // «если цена вернётся к обычной» — вверх
  await toWhatIf.click();
  await expect(page).toHaveURL(/#\/what-if\?.*crop=wheat/);
  await expect(main(page)).toContainText('Цена вернулась к обычной для');
});

test('С3 «Почему в этом году хуже?»: саратовская пшеница 2023 → 2024 → засуха', async ({ page }) => {
  await page.goto('/#/why');
  await page.getByRole('link', { name: /Открыть пример/ }).first().click();
  await expect(page).toHaveURL(/region=saratov/);
  await expect(page).toHaveURL(/crop=wheat/);
  await expect(main(page)).toContainText(num('−3 159 ₽/га'));
  await expect(main(page)).toContainText(num('−10 939'));

  // Шаг «Показатель» → «Динамика» → «Регион» → «Фактор»
  await page.locator('main').getByRole('button', { name: /^Урожайность/ }).first().click();
  await expect(page).toHaveURL(/factor=yield/);
  for (const step of ['dynamics', 'region', 'factor']) {
    await page.locator('main').getByRole('button', { name: /^Дальше/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`step=${step}`));
    if (step === 'region') await expect(main(page)).toContainText('Россия в среднем');
  }
  await expect(main(page)).toContainText('Главная причина');
  await expect(main(page)).toContainText(num('13 мм при норме 34 мм'));

  // «Назад» браузера возвращает по шагам drill-down
  await page.goBack();
  await expect(page).toHaveURL(/step=region/);
});

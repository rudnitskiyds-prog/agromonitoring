import { expect, test, type Page } from '@playwright/test';
import { DEMO_FARM, STORAGE_KEY } from '../src/store/farm';

// Сценарии С1–С3 из раздела 5 CLAUDE.md — кликами, как фермер.
// Числа — из демо-данных public/data; если демо-ряды пересоберутся, обновить ожидания.

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
  await expect(main(page)).toContainText(num('солярка +8,8% (−381 ₽'));
  await expect(main(page)).toContainText(num('цена +7% (+6 325 ₽'));

  await page.locator('main a[href*="focus=diesel"]').first().click();
  await expect(page).toHaveURL(/#\/market\?.*focus=diesel/);
  await expect(main(page)).toContainText('Во сколько мне обошёлся рост солярки?');
  await expect(main(page)).toContainText(num('−69 ₽'));
});

test('С2 «Продавать сейчас или ждать?»: рынок → окно продаж → «Что если»', async ({ page }) => {
  await page.goto('/#/market');
  await expect(main(page)).toContainText('Окно для продаж');
  await expect(main(page)).toContainText('на 6% выше');

  await page.locator('main a[href*="what-if"][href*="pricePct=-6"]').first().click();
  await expect(page).toHaveURL(/#\/what-if\?.*crop=wheat.*pricePct=-6/);
  await expect(main(page)).toContainText('Цена вернулась к обычной для октября');
  await expect(main(page)).toContainText(num('16 948 040 ₽'));
});

test('С3 «Почему в этом году хуже?»: пример → водопад → урожайность → регион → погода', async ({ page }) => {
  await page.goto('/#/why');
  await page.getByRole('link', { name: /Открыть пример/ }).first().click();
  await expect(page).toHaveURL(/region=saratov.*crop=sunflower|crop=sunflower.*region=saratov/);
  await expect(main(page)).toContainText(num('−8 544 ₽/га'));
  await expect(main(page)).toContainText(num('−11 382'));

  // Шаг «Показатель» → «Динамика» → «Регион» → «Фактор»
  await page.locator('main').getByRole('button', { name: /^Урожайность/ }).first().click();
  await expect(page).toHaveURL(/factor=yield/);
  for (const step of ['dynamics', 'region', 'factor']) {
    await page.locator('main').getByRole('button', { name: /^Дальше/ }).first().click();
    await expect(page).toHaveURL(new RegExp(`step=${step}`));
    if (step === 'region') await expect(main(page)).toContainText('Россия в среднем');
  }
  await expect(main(page)).toContainText('Главная причина');
  await expect(main(page)).toContainText(num('12 мм при норме 34 мм'));

  // «Назад» браузера возвращает по шагам drill-down
  await page.goBack();
  await expect(page).toHaveURL(/step=region/);
});

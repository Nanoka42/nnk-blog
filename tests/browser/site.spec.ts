import { test, expect } from '@playwright/test';

test('key routes, images and viewport layout', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/posts/');
  const firstPost = await page.locator('.post-card h2 a').first().getAttribute('href');
  for (const route of ['/', '/posts/', firstPost!, '/projects/', '/projects/conway-soldiers/', '/about/', '/missing-page/']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(route === '/missing-page/' ? 404 : 200);
    // The compact game hides its decorative masthead to leave room for controls.
    await expect(page.locator(route === '/projects/conway-soldiers/' ? '#board' : 'main h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const img of await page.locator('img:visible').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
  }
  await page.goto('/');
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('fixture tables/code/math scroll within the page and copy exact sources', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/posts/markdown-regression/');
  await expect(page.locator('.math-copy').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const button of [page.locator('.math-inline button').first(), page.locator('.math-block button').first(), page.locator('.code-block button').first(), page.locator('.code-block button').nth(1)]) {
    const source = await button.getAttribute('data-copy-source');
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveText('已复制');
    // Windows clipboard normalizes LF to CRLF; compare logical source lines.
    expect((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n')).toBe(source);
  }
  if (testInfo.project.name !== 'desktop') {
    expect(await page.locator('.table-scroll').last().evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await page.locator('.mobile-toc summary').click();
    await expect(page.locator('.mobile-toc ol')).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('markdown.png'), fullPage: true });
});

test('clipboard denial offers a selectable source dialog', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.goto('/posts/markdown-regression/');
  const button = page.locator('.math-inline button').first();
  await button.click();
  await expect(page.locator('#copy-fallback')).toBeVisible();
  await expect(page.locator('#copy-fallback-source')).toHaveValue((await button.getAttribute('data-copy-source'))!);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('#copy-fallback')).not.toBeVisible();
});

test('theme follows the system, persists explicit choice and works by keyboard', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#theme-toggle').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('integrated Conway game starts and accepts keyboard input', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/projects/conway-soldiers/');
  await expect(page).toHaveURL(/\/projects\/conway-soldiers\/$/);
  await expect(page.locator('#board')).toBeVisible();
  await page.locator('#board').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.locator('#primary-action').click();
  await expect(page.locator('#mode-name')).not.toHaveText('蓝图模式');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '规则与关于', exact: true }).click();
  await expect(page.locator('#info-dialog')).toBeVisible();
  await expect(page.locator('#info-dialog .credits strong')).toHaveText('真理院七叶');
  await page.screenshot({ path: testInfo.outputPath('game-info.png') });
  await page.getByRole('button', { name: '关闭信息页' }).click();
  await page.screenshot({ path: testInfo.outputPath('game.png') });
  expect(errors).toEqual([]);
});

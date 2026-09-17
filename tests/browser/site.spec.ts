import { test, expect } from '@playwright/test';
import { conwayPath, conway3dPath } from '../../config/redirects.mjs';

test('key routes, images and viewport layout', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/posts/');
  const firstPost = await page.locator('.post-card h2 a').first().getAttribute('href');
  for (const route of ['/', '/posts/', firstPost!, '/projects/', conwayPath, conway3dPath, '/about/', '/missing-page/']) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(route === '/missing-page/' ? 404 : 200);
    // The compact game hides its decorative masthead to leave room for controls.
    await expect(page.locator([conwayPath, conway3dPath].includes(route) ? '#board' : 'main h1')).toBeVisible();
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
  await expect(page.locator(`#info-dialog a[href="${conway3dPath}"]`)).toHaveText(/游玩.*3D/);
  await page.screenshot({ path: testInfo.outputPath('game-info.png') });
  await page.getByRole('button', { name: '关闭信息页' }).click();
  await page.screenshot({ path: testInfo.outputPath('game.png') });
  expect(errors).toEqual([]);
});

test('3D game makes a cross-slice jump, follows it, and undoes it on every viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(conway3dPath);
  const board = page.locator('#board');
  await expect(board).toBeVisible();
  await expect(page.locator('#primary-action')).toBeDisabled();

  // The initial cursor is (0, Y, 2). Place (0, 0, 0) and (0, 1, 0)
  // through the public keyboard controls, without bypassing UI state.
  const operateAtGround = async () => {
    await board.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
  };
  await operateAtGround();
  await page.locator('#slice-next').click();
  await expect(page.locator('#slice-value')).toHaveValue('1');
  await operateAtGround();
  await expect(page.locator('#pieces')).toHaveText('2');
  await page.locator('#slice-prev').click();
  await page.locator('#primary-action').click();
  await expect(page.locator('#mode-name')).toHaveText('跳棋模式');
  await operateAtGround();
  await expect(page.locator('#selection-label')).toHaveText('X 0 / Y 0 / Z 0');
  await expect(page.locator('#jump-yp')).toBeEnabled();
  await page.locator('#jump-yp').click();
  await expect(page.locator('#steps')).toHaveText('1');
  await expect(page.locator('#pieces')).toHaveText('1');
  await expect(page.locator('#slice-value')).toHaveValue('2');
  await page.locator('#tertiary-action').click();
  await expect(page.locator('#steps')).toHaveText('0');
  await expect(page.locator('#pieces')).toHaveText('2');
  await expect(page.locator('#slice-value')).toHaveValue('0');
  await expect(page.locator('#tertiary-action')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const boardSize = await board.boundingBox();
  expect(boardSize!.width).toBeGreaterThan(250);
  expect(boardSize!.height).toBeGreaterThan(180);
  const footer = await page.locator('.game-site-footer').boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.screenshot({ path: testInfo.outputPath('game-3d.png'), fullPage: true });

  await page.locator('#info').click();
  await expect(page.locator('#info-dialog')).toBeVisible();
  await expect(page.locator(`#info-dialog a[href="${conwayPath}"]`)).toHaveText(/游玩.*2D/);
  await page.screenshot({ path: testInfo.outputPath('game-3d-info.png') });
  await page.locator('#close-info').click();
  await expect(page.locator('#info-dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

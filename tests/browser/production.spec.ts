import { test as base, expect, type Request } from '@playwright/test';
import { load } from 'cheerio';
import { conwayPath, redirectPaths } from '../../config/redirects.mjs';

// Global setup publishes the two API-managed servers after configuration is loaded.
// Read this at fixture setup so production checks cannot silently target the development server.
const test = base.extend({
  baseURL: async ({}, use) => {
    const url = process.env.PLAYWRIGHT_PRODUCTION_BASE_URL;
    if (!url) throw new Error('Production preview did not report PLAYWRIGHT_PRODUCTION_BASE_URL. Run npm run build before the browser suite.');
    await use(url);
  },
});

test('built homepage displays ICP registration and the published article is readable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  const registration = page.locator('footer').getByRole('link', { name: /粤ICP备2026138999号/ });
  await expect(registration).toBeVisible();
  await expect(registration).toHaveAttribute('href', /^https:\/\/beian\.miit\.gov\.cn\/?$/);
  await expect(page.locator('.draft-label')).toHaveCount(0);

  const article = await page.goto('/posts/hello-world/');
  expect(article?.status()).toBe(200);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('.prose')).toBeVisible();
  expect(errors).toEqual([]);
});

test('draft and removed article routes are absent from the actual static server', async ({ request }) => {
  for (const route of ['/posts/markdown-regression/', '/posts/conway-notes/']) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
  }
  const listing = await request.get('/posts/');
  expect(listing.status()).toBe(200);
  expect(await listing.text()).not.toMatch(/markdown-regression|conway-notes|regression-only/);
});

test('production RSS and sitemap exclude draft and removed content', async ({ request }) => {
  for (const route of ['/rss.xml', '/sitemap-index.xml', '/sitemap-0.xml']) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const xml = await response.text();
    expect(xml, route).not.toMatch(/markdown-regression|conway-notes|regression-only/);
    if (route !== '/sitemap-index.xml') expect(xml, route).toContain('/posts/hello-world/');
  }
});

test('all short and legacy links redirect, preserving navigation and working without JavaScript', async ({ page, request, browser, baseURL }) => {
  // HTTP requests inspect every static fallback without executing refresh or JavaScript.
  // redirectPaths includes all 25 public short links and the former /play/ entry.
  for (const path of redirectPaths) for (const suffix of ['', '/']) {
    const route = `/${path}${suffix}`;
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const $ = load(await response.text());
    expect($('meta[http-equiv="refresh"]').attr('content'), route).toBe(`0;url=${conwayPath}`);
    expect($('meta[name="robots"]').attr('content'), route).toContain('noindex');
    expect(new URL($('link[rel="canonical"]').attr('href')!).pathname, route).toBe(conwayPath);
    expect($(`main a[href="${conwayPath}"]`).length, route).toBe(1);
  }

  for (const route of ['/coso', '/conways_checkers/', '/conway-soldier', '/play/conway-soldiers/']) {
    await page.goto(route);
    await expect(page).toHaveURL(new URL(conwayPath, baseURL).href);
  }
  const suffix = '?from=short-link&text=%E6%B5%8B%E8%AF%95#game-test';
  await page.goto(`/coso${suffix}`);
  await expect(page).toHaveURL(new URL(conwayPath + suffix, baseURL).href);

  const noScript = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const fallbackPage = await noScript.newPage();
    await fallbackPage.goto('/conways_checkers');
    await expect(fallbackPage).toHaveURL(new URL(conwayPath, baseURL).href);
    await expect(fallbackPage.locator('#board')).toBeVisible();
  } finally {
    await noScript.close();
  }

  for (const route of ['/conway-checker-extra/', '/coso-extra/']) {
    expect((await request.get(route)).status(), route).toBe(404);
  }
});

test('built project route starts the board, loads dynamic assets and exposes registration', async ({ page, baseURL }) => {
  const errors: string[] = [];
  const pending = new Set<Request>();
  const origin = new URL(baseURL!).origin;
  const sameOrigin = (url: string) => new URL(url).origin === origin;
  page.on('pageerror', (error) => errors.push(`Page error: ${error.message}`));
  page.on('request', (request) => { if (sameOrigin(request.url())) pending.add(request); });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => {
    pending.delete(request);
    if (sameOrigin(request.url())) errors.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', (response) => {
    if (sameOrigin(response.url()) && response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  const response = await page.goto(conwayPath);
  expect(response?.status()).toBe(200);
  await expect(page.locator('#board')).toBeVisible();
  await page.locator('#board').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.locator('#primary-action').click();
  await expect(page.locator('#mode-name')).toHaveText('跳棋模式');
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  for (const image of await page.locator('img:visible').all()) {
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByRole('link', { name: /粤ICP备2026138999号/ })).toBeVisible();
  await page.getByRole('button', { name: '规则与关于', exact: true }).click();
  await expect(page.locator('#info-dialog')).toContainText('真理院七叶');
  await expect.poll(() => pending.size, { message: 'Game assets should finish loading' }).toBe(0);
  expect(errors).toEqual([]);
});

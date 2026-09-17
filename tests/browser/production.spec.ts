import { test as base, expect, type Request } from '@playwright/test';
import { load } from 'cheerio';
import { conwayPath, conway3dPath, redirectPaths, redirects } from '../../config/redirects.mjs';

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

test('all 2D and 3D short links redirect to their own game, including without JavaScript', async ({ page, request, browser, baseURL }) => {
  // HTTP requests inspect every static fallback without executing refresh or JavaScript.
  // Test both slash forms of every exact alias, including the former /play/ entries.
  for (const path of redirectPaths) for (const suffix of ['', '/']) {
    const route = `/${path}${suffix}`;
    const target = redirects[`/${path}/`];
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const $ = load(await response.text());
    expect($('meta[http-equiv="refresh"]').attr('content'), route).toBe(`0;url=${target}`);
    expect($('meta[name="robots"]').attr('content'), route).toContain('noindex');
    expect(new URL($('link[rel="canonical"]').attr('href')!).pathname, route).toBe(target);
    expect($(`main a[href="${target}"]`).length, route).toBe(1);
  }

  for (const route of ['/coso', '/conways_checkers/', '/conway-soldier', '/play/conway-soldiers/']) {
    await page.goto(route);
    await expect(page).toHaveURL(new URL(conwayPath, baseURL).href);
  }
  for (const route of ['/coso3d', '/conways_checkers_3d/', '/conway-soldier-3d', '/conwaychecker3d/', '/play/conway-soldiers-3d/']) {
    await page.goto(route);
    await expect(page).toHaveURL(new URL(conway3dPath, baseURL).href);
  }
  const suffix = '?from=short-link&text=%E6%B5%8B%E8%AF%95#game-test';
  for (const [alias, target] of [['coso', conwayPath], ['coso3d', conway3dPath]]) {
    await page.goto(`/${alias}${suffix}`);
    await expect(page).toHaveURL(new URL(target + suffix, baseURL).href);
  }

  const noScript = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const fallbackPage = await noScript.newPage();
    for (const [alias, target] of [['conways_checkers', conwayPath], ['conways_checkers-3d', conway3dPath]]) {
      await fallbackPage.goto(`/${alias}`);
      await expect(fallbackPage).toHaveURL(new URL(target, baseURL).href);
      await expect(fallbackPage.locator('#board')).toBeVisible();
    }
  } finally {
    await noScript.close();
  }

  for (const route of ['/conway-checker-extra/', '/coso-extra/', '/conway-checker-3d-extra/', '/coso3d-extra/', '/conway_checker__3d/']) {
    expect((await request.get(route)).status(), route).toBe(404);
  }
});

for (const gamePath of [conwayPath, conway3dPath]) test(`built ${gamePath} starts using only local assets and exposes registration`, async ({ page, baseURL }) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  const loadedAssets = new Set<string>();
  const pending = new Set<Request>();
  const origin = new URL(baseURL!).origin;
  const sameOrigin = (url: string) => new URL(url).origin === origin;
  // A third-party runtime dependency fails even when the developer machine is online.
  await page.route('**/*', async (route) => {
    if (!sameOrigin(route.request().url())) {
      externalRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  page.on('pageerror', (error) => errors.push(`Page error: ${error.message}`));
  page.on('request', (request) => { if (sameOrigin(request.url())) pending.add(request); });
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => {
    pending.delete(request);
    if (sameOrigin(request.url())) errors.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('response', (response) => {
    if (sameOrigin(response.url()) && response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    if (sameOrigin(response.url()) && response.status() === 200) loadedAssets.add(new URL(response.url()).pathname);
  });
  const response = await page.goto(gamePath);
  expect(response?.status()).toBe(200);
  await expect(page.locator('#board')).toBeVisible();
  await page.locator('#board').focus();
  await page.keyboard.press('ArrowDown');
  if (gamePath === conway3dPath) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.locator('#primary-action').click();
  await expect(page.locator('#mode-name')).toHaveText('跳棋模式');
  if (gamePath === conway3dPath) {
    await page.locator('#board').focus();
    await page.keyboard.press('Space');
    await page.locator('#plane-xy').click();
    await expect(page.locator('#plane-badge')).toHaveText('XY 工作面 · Z = 0');
    await expect(page.locator('#selection-label')).toHaveText('X 0 / Y 0 / Z 0');
    await page.locator('#face').click();
    await expect(page.locator('#edge-warning')).toBeHidden();
    await page.locator('#slice-next').click();
    await expect(page.locator('#plane-badge')).toHaveText('XY 工作面 · Z = 1');
    await expect(page.locator('#selection-label')).toHaveText('选择一枚棋子');
  }
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  for (const image of await page.locator('img:visible').all()) {
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByRole('link', { name: /粤ICP备2026138999号/ })).toBeVisible();
  await page.locator('#info').click();
  await expect(page.locator('#info-dialog')).toContainText('真理院七叶');
  const otherGame = gamePath === conwayPath ? conway3dPath : conwayPath;
  const otherGameLink = page.locator(`#info-dialog a[href="${otherGame}"]`);
  await expect(otherGameLink).toHaveCount(1);
  await expect.poll(() => pending.size, { message: 'Game assets should finish loading' }).toBe(0);
  const slug = gamePath.split('/').filter(Boolean).at(-1);
  expect(loadedAssets.has(`/play/${slug}/src/app.js`)).toBe(true);
  expect([...loadedAssets].some((path) => path.startsWith(`/play/${slug}/sounds/`) && path.endsWith('.wav'))).toBe(true);
  await otherGameLink.click();
  await expect(page).toHaveURL(new URL(otherGame, baseURL).href);
  await expect(page.locator('#board')).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('3D controls remain reachable above the site footer on short screens', async ({ page }) => {
  for (const [width, height] of [[320, 568], [390, 580], [390, 600], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.goto(conway3dPath);
    const checkFooter = async () => {
      const app = await page.locator('.app').boundingBox();
      const footer = await page.locator('.game-site-footer').boundingBox();
      expect(footer!.y, `${width}×${height}: footer must follow the game`).toBeGreaterThanOrEqual(app!.y + app!.height - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const selector of ['#plane-xz', '#plane-xy', '#slice-prev', '#slice-next', '#primary-action', '#secondary-action', '#tertiary-action']) {
        const button = page.locator(selector);
        await button.scrollIntoViewIfNeeded();
        expect(await button.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(box.x + box.width / 2, box.bottom - 3));
        }), `${width}×${height}: ${selector} must not be covered`).toBe(true);
      }
    };
    await checkFooter();
    await page.locator('#tertiary-action').click();
    await page.locator('#primary-action').click();
    await expect(page.locator('#mode-name')).toHaveText('跳棋模式');
    await page.locator('#plane-xy').click();
    await page.locator('#face').click();
    await expect(page.locator('#plane-badge')).toContainText('XY');
    await checkFooter();
  }
});

test('published project listing and sitemap link to both playable versions', async ({ page, request }) => {
  await page.goto('/projects/');
  for (const path of [conwayPath, conway3dPath]) {
    await expect(page.locator(`.project-card h2 a[href="${path}"]`)).toBeVisible();
  }
  const response = await request.get('/sitemap-0.xml');
  expect(response.status()).toBe(200);
  const $ = load(await response.text(), { xmlMode: true });
  const routes = $('loc').toArray().map((node) => new URL($(node).text()).pathname);
  for (const path of [conwayPath, conway3dPath]) expect(routes).toContain(path);
  expect(routes.some((path) => Object.hasOwn(redirects, path))).toBe(false);
});

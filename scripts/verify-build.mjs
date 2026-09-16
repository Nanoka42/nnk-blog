import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { siteUrl, isLocalSite } from '../config/site.mjs';
import { redirects, conwayPath } from '../config/redirects.mjs';
import { icpRegistration } from '../config/registration.mjs';

const output = fileURLToPath(new URL('../dist/', import.meta.url));
const required = ['index.html', 'posts/index.html', 'projects/index.html', 'projects/conway-soldiers/index.html', 'play/conway-soldiers/src/app.js', 'play/conway-soldiers/sounds/move.wav', 'about/index.html', '404.html', 'rss.xml', 'robots.txt', 'sitemap-index.xml', 'sitemap-0.xml', ...Object.keys(redirects).map((path) => `${path.slice(1)}index.html`)];
for (const file of required) assert.ok((await stat(join(output, file))).isFile(), file);
const files = await readdir(output, { recursive: true });
assert.ok(!files.some((file) => /markdown-regression|regression-only|conway-notes/.test(file)), 'draft or removed route leaked');
let references = 0;
for (const file of files.filter((file) => /\.(html|xml)$/.test(file))) {
  const html = await readFile(join(output, file), 'utf8');
  assert.ok(!html.includes('Markdown 排版与交互回归测试'), `draft content leaked into ${file}`);
  assert.ok(!html.includes('/posts/conway-notes/'), `removed article linked from ${file}`);
  if (!file.endsWith('.html')) continue;
  const $ = load(html);
  $('.prose .math-copy').each((_, node) => assert.equal($(node).find('button').attr('data-copy-source'), $(node).attr('data-math-source')));
  $('.prose pre').each((_, node) => assert.ok($(node).parent('.code-block').find('button[data-copy-source]').length, 'code copy control missing'));
  $('.prose table').each((_, node) => assert.ok($(node).parent('.table-scroll').length, 'table scroll container missing'));
  const route = '/' + file.replaceAll('\\', '/').replace(/index\.html$/, '');
  assert.ok($('title').text().trim(), `${file}: title`);
  const redirectTarget = redirects[route];
  assert.equal($('link[rel=canonical]').attr('href'), new URL(redirectTarget || route, siteUrl).href, `${file}: canonical`);
  assert.ok($('meta[name=description]').length, `${file}: description`);
  const registration = $('.registration a').filter((_, node) => $(node).text() === icpRegistration.number);
  assert.equal(registration.attr('href'), icpRegistration.url, `${file}: ICP registration`);
  const noindex = $('meta[name=robots]').attr('content')?.includes('noindex') || false;
  assert.equal(noindex, isLocalSite || Boolean(redirectTarget) || route === '/404.html', `${file}: indexing policy`);
  if (redirectTarget) assert.equal($('meta[http-equiv=refresh]').attr('content'), `0;url=${redirectTarget}`, `${file}: redirect destination`);
  if (route === conwayPath) {
    assert.equal($('#board').length, 1, 'primary project route must contain the game');
    assert.equal($('.rule-diagram').length, 0, 'removed rule diagram');
    assert.equal($('.credits strong').text(), '真理院七叶', 'game credit');
  }
  const links = $('a[href],img[src],script[src],link[href],source[src],audio[src],video[src]').toArray().map((node) => $(node).attr('href') || $(node).attr('src'));
  for (const node of $('[srcset]').toArray()) {
    links.push(...$(node).attr('srcset').split(',').map((entry) => entry.trim().split(/\s+/)[0]));
  }
  for (const link of links) {
    if (!link || /^(#|data:|mailto:|tel:)/.test(link)) continue;
    const url = new URL(link, new URL(route, siteUrl));
    if (url.origin !== new URL(siteUrl).origin) continue;
    const path = decodeURIComponent(url.pathname).replace(/^\//, '');
    let target = resolve(output, path);
    assert.ok(!relative(output, target).startsWith('..'), 'asset escaped dist');
    if (url.pathname.endsWith('/')) target = join(target, 'index.html');
    const exists = await stat(target).then((entry) => entry.isFile()).catch((error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    });
    assert.ok(exists, `${file}: broken reference ${link}`);
    references++;
  }
}
const sitemap = load(await readFile(join(output, 'sitemap-0.xml'), 'utf8'), { xmlMode: true });
const listed = sitemap('loc').toArray().map((node) => new URL(sitemap(node).text()).pathname);
assert.ok(listed.includes(conwayPath), 'game must be discoverable');
assert.ok(!listed.some((path) => redirects[path] || path === '/404.html'), 'redirects and 404 must not appear in sitemap');
for (const file of ['rss.xml', 'sitemap-index.xml', 'sitemap-0.xml']) {
  const xml = load(await readFile(join(output, file), 'utf8'), { xmlMode: true });
  for (const node of xml('loc, link').toArray()) {
    const value = xml(node).text();
    if (!value) continue;
    const url = new URL(value);
    assert.equal(url.origin, new URL(siteUrl).origin, `${file}: wrong production origin`);
    const target = join(output, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
    assert.ok((await stat(target)).isFile(), `${file}: broken entry ${value}`);
  }
}
const robots = await readFile(join(output, 'robots.txt'), 'utf8');
assert.ok(robots.includes(isLocalSite ? 'Disallow: /' : 'Allow: /'), 'robots origin policy');
console.log(`Production verified: ${required.length} required artifacts, ${references} local references, redirects, ICP, indexing, draft exclusion, Markdown features.`);

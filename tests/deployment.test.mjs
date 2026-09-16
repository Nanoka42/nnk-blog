import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDeploymentChecks, describeFetchFailure, validateOrigin, verifyDeployment, verifyWithRetries } from '../scripts/verify-deployment.mjs';

const origin = 'https://nanoka.example';
let directory;
let checks;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nanoka-deployment-test-'));
  const files = [
    'index.html', '404.html', 'posts/index.html', 'about/index.html',
    'projects/conway-soldiers/index.html', 'posts/first-post/index.html', 'tags/杂谈/index.html',
    'play/conway-soldiers/src/app.js', 'play/conway-soldiers/src/styles.css',
    'play/conway-soldiers/sounds/move.wav', 'rss.xml', 'robots.txt', 'sitemap-index.xml', 'sitemap-0.xml',
    '_astro/site.hash.css', '_astro/avatar.hash.webp', '_astro/math.hash.woff2',
  ];
  await Promise.all(files.map(async (file) => {
    await mkdir(dirname(join(directory, file)), { recursive: true });
    await writeFile(join(directory, file), `release bytes for ${file}`);
  }));
  checks = await createDeploymentChecks(directory);
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

function mockFetch(mutate = () => {}, selectedChecks = checks) {
  return async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(url.search, '', 'checks must use the real cached URL');
    const check = selectedChecks.find((candidate) => candidate.path === decodeURIComponent(url.pathname));
    assert.ok(check, `unexpected request ${url.pathname}`);
    const response = {
      body: check.redirect ? null : check.body,
      status: check.redirect ? 302 : check.status,
      headers: check.redirect ? { location: '/posts/' } : {
        'content-type': `${check.mime[0]}; charset=utf-8`,
        ...(check.maxAge === undefined ? {} : {
          'cache-control': `public, max-age=${check.maxAge}${check.immutable ? ', immutable' : ''}`,
        }),
      },
    };
    mutate(check, response);
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
}

test('release checks select real Unicode routes, game files, and Astro asset categories', async () => {
  assert.ok(checks.some((check) => check.path === '/tags/杂谈/'));
  assert.ok(checks.some((check) => check.path === '/posts/first-post/'));
  assert.ok(checks.some((check) => check.path.endsWith('.wav')));
  assert.equal(checks.filter((check) => check.immutable).length, 3);
  const result = await verifyDeployment(origin, { checks, fetchImpl: mockFetch() });
  assert.equal(result.ok, true);
  assert.equal(result.checked, 19);
});

test('accepts standard JavaScript and WAV MIME aliases', async () => {
  const result = await verifyDeployment(origin, { checks, fetchImpl: mockFetch((check, response) => {
    if (check.path.endsWith('.js')) response.headers['content-type'] = 'application/javascript';
    if (check.path.endsWith('.wav')) response.headers['content-type'] = 'audio/x-wav';
  }) });
  assert.equal(result.ok, true);
});

test('a release without articles or optional assets accepts English-only tags and no tags', async (t) => {
  const minimal = await mkdtemp(join(tmpdir(), 'nanoka-deployment-minimal-'));
  t.after(() => rm(minimal, { recursive: true, force: true }));
  const files = [
    'index.html', '404.html', 'posts/index.html', 'about/index.html',
    'projects/conway-soldiers/index.html', 'tags/notes/index.html',
    'play/conway-soldiers/src/app.js', 'play/conway-soldiers/src/styles.css',
    'play/conway-soldiers/sounds/move.wav', 'rss.xml', 'robots.txt', 'sitemap-index.xml', 'sitemap-0.xml',
  ];
  await Promise.all(files.map(async (file) => {
    await mkdir(dirname(join(minimal, file)), { recursive: true });
    await writeFile(join(minimal, file), `minimal release bytes for ${file}`);
  }));
  const englishChecks = await createDeploymentChecks(minimal);
  assert.ok(englishChecks.some((check) => check.path === '/tags/notes/'));
  assert.equal(englishChecks.some((check) => check.immutable), false);
  assert.equal((await verifyDeployment(origin, {
    checks: englishChecks, fetchImpl: mockFetch(undefined, englishChecks),
  })).ok, true);

  await rm(join(minimal, 'tags/notes/index.html'));
  const noTagChecks = await createDeploymentChecks(minimal);
  assert.equal(noTagChecks.some((check) => check.path.startsWith('/tags/')), false);
  assert.equal((await verifyDeployment(origin, {
    checks: noTagChecks, fetchImpl: mockFetch(undefined, noTagChecks),
  })).ok, true);
});

const errors = [
  ['stale content even with HTTP 200', '/', (response) => { response.body = 'old release'; }, /bytes differ/],
  ['HTML served as a download MIME type', '/', (response) => { response.headers['content-type'] = 'application/octet-stream'; }, /Content-Type/],
  ['attachment disposition on an otherwise correct page', '/', (response) => { response.headers['content-disposition'] = 'attachment; filename="index.html"'; }, /forces a download/],
  ['SPA fallback returning 200 for an unknown directory', 'missing', (response) => { response.status = 200; }, /expected HTTP 404/],
  ['generic error body instead of the release 404 page', 'missing', (response) => { response.body = 'NoSuchKey'; }, /bytes differ/],
  ['redirect leaking the origin hostname', '/posts', (response) => { response.headers.location = 'https://oss-origin.example/posts/'; }, /retain the requested origin/],
  ['missing directory redirect', '/posts', (response) => { response.status = 200; }, /directory redirect/],
  ['long HTML caching', '/', (response) => { response.headers['cache-control'] = 'public, max-age=31536000'; }, /max-age=60/],
  ['missing immutable cache directive', '/_astro/site.hash.css', (response) => { response.headers['cache-control'] = 'public, max-age=31536000'; }, /missing immutable/],
  ['short XML caching', '/rss.xml', (response) => { response.headers['cache-control'] = 'public, max-age=60'; }, /max-age=300/],
];

for (const [description, path, mutate, expected] of errors) {
  test(`rejects ${description}`, async () => {
    const result = await verifyDeployment(origin, { checks, fetchImpl: mockFetch((check, response) => {
      if (path === 'missing' ? check.status === 404 : check.path === path) mutate(response);
    }) });
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 1);
    assert.ok(result.failures[0].errors.some((error) => expected.test(error)), JSON.stringify(result.failures));
  });
}

test('retries stale CDN content and reports success only after a complete clean pass', async () => {
  let homepageRequests = 0;
  const logs = [];
  const result = await verifyWithRetries(origin, {
    checks, retryIntervalMs: 0, maxDurationMs: 1000, log: (message) => logs.push(message),
    fetchImpl: mockFetch((check, response) => {
      if (check.path === '/' && homepageRequests++ === 0) response.body = 'old release';
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(logs.filter((message) => message.startsWith('Verified ')).length, 1);
  assert.match(logs.at(-1), /checks passed/);
});

test('the overall budget bounds a fetch implementation that never settles', async () => {
  const start = Date.now();
  const result = await verifyWithRetries(origin, {
    checks, maxDurationMs: 30, retryIntervalMs: 0, log: () => {},
    fetchImpl: () => new Promise(() => {}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.attempts, 1);
  assert.ok(result.failures.every((failure) => failure.errors.some((error) => /deadline/.test(error))));
  assert.ok(Date.now() - start < 1000);
});

test('per-request timeout also covers a response body that never finishes', async () => {
  const start = Date.now();
  const result = await verifyDeployment(origin, {
    checks: [checks[0]], requestTimeoutMs: 20,
    fetchImpl: async () => ({
      status: 200, headers: new Headers({ 'content-type': 'text/html', 'cache-control': 'public, max-age=60' }),
      arrayBuffer: () => new Promise(() => {}),
    }),
  });
  assert.equal(result.ok, false);
  assert.match(result.failures[0].errors[0], /timed out/);
  assert.ok(Date.now() - start < 1000);
});

test('rejects HTTP targets, embedded credentials, and non-origin URLs before fetching', () => {
  for (const value of ['http://nanoka.example', 'https://user:password@nanoka.example', 'https://nanoka.example/posts/', 'https://nanoka.example?bypass=1', 'https://nanoka.example/#fragment']) {
    assert.throws(() => validateOrigin(value));
  }
  assert.equal(validateOrigin(`${origin}/`), origin);
});

test('TLS transport failure reports its underlying code without leaking request details', async () => {
  const cause = Object.assign(new Error('private-token https://user:password@private.example/?token=private-token'), {
    code: 'ERR_SSL_SSL/TLS_ALERT_HANDSHAKE_FAILURE',
  });
  const result = await verifyDeployment(origin, {
    checks: [checks[0]],
    fetchImpl: async () => { throw new TypeError('fetch failed with private-token', { cause }); },
  });
  assert.equal(result.ok, false);
  const message = result.failures[0].errors[0];
  assert.match(message, /ERR_SSL_SSL\/TLS_ALERT_HANDSHAKE_FAILURE/);
  assert.match(message, /check CDN HTTPS is enabled/);
  assert.doesNotMatch(message, /private-token|private\.example|password/);
});

test('DNS and aggregate connection errors remain distinguishable and cyclic causes are bounded', () => {
  const dns = new TypeError('fetch failed', { cause: Object.assign(new Error(), { code: 'ENOTFOUND' }) });
  assert.match(describeFetchFailure(dns), /ENOTFOUND.*DNS resolution failed/);
  const connections = new AggregateError([
    Object.assign(new Error(), { code: 'ECONNREFUSED' }),
    Object.assign(new Error(), { code: 'ETIMEDOUT' }),
  ]);
  connections.cause = connections;
  assert.match(describeFetchFailure(new TypeError('fetch failed', { cause: connections })), /ECONNREFUSED; ETIMEDOUT.*Connection failed/);
  assert.equal(describeFetchFailure(new TypeError('sensitive details')), 'GET failed (TypeError).');
});

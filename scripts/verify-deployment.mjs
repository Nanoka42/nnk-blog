import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const mimeTypes = {
  '.html': ['text/html'],
  '.css': ['text/css'],
  '.js': ['text/javascript', 'application/javascript', 'application/x-javascript'],
  '.xml': ['application/xml', 'text/xml', 'application/rss+xml'],
  '.txt': ['text/plain'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
  '.webp': ['image/webp'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.svg': ['image/svg+xml'],
  '.avif': ['image/avif'],
  '.woff2': ['font/woff2', 'application/font-woff2', 'application/x-font-woff2'],
  '.woff': ['font/woff', 'application/font-woff', 'application/x-font-woff'],
  '.ttf': ['font/ttf', 'application/x-font-ttf', 'application/font-sfnt'],
};

export function validateOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Deployment target must be an HTTPS origin without credentials, a path, query, or fragment.');
  }
  return url.origin;
}

// Use the actual release artifact to select representative directory routes and assets.
export async function createDeploymentChecks(distDir = 'dist') {
  const files = (await readdir(distDir, { recursive: true })).map((file) => file.replaceAll('\\', '/')).sort();
  const find = (pattern) => files.find((candidate) => pattern.test(candidate));
  const select = (pattern, description) => {
    const file = find(pattern);
    if (!file) throw new Error(`Release artifact is missing ${description}.`);
    return file;
  };
  const article = find(/^posts\/.+\/index\.html$/);
  const tag = find(/^tags\/[^/]*\p{Script=Han}[^/]*\/index\.html$/u) ?? find(/^tags\/[^/]+\/index\.html$/);
  const assets = [
    find(/^_astro\/.+\.css$/),
    find(/^_astro\/.+\.(webp|png|jpe?g|svg|avif)$/),
    find(/^_astro\/.+\.(woff2?|ttf)$/),
  ].filter(Boolean);
  const directoryRoute = (file) => `/${file.replace(/index\.html$/, '')}`;
  const pages = [
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/posts/', 'posts/index.html'],
    ['/about/', 'about/index.html'],
    ['/projects/conway-soldiers/', 'projects/conway-soldiers/index.html'],
    ['/projects/conway-soldiers-3d/', 'projects/conway-soldiers-3d/index.html'],
    ['/coso/', 'coso/index.html', '/projects/conway-soldiers/'],
    ['/coso3d/', 'coso3d/index.html', '/projects/conway-soldiers-3d/'],
    ...[article, tag].filter(Boolean).map((file) => [directoryRoute(file), file]),
  ];
  const fixedAssets = [
    'play/conway-soldiers/src/app.js',
    'play/conway-soldiers/src/styles.css',
    select(/^play\/conway-soldiers\/sounds\/.+\.wav$/, 'a game WAV asset'),
    'play/conway-soldiers-3d/src/app.js',
    'play/conway-soldiers-3d/src/styles.css',
    select(/^play\/conway-soldiers-3d\/sounds\/.+\.wav$/, 'a 3D game WAV asset'),
    'rss.xml', 'robots.txt', 'sitemap-index.xml', 'sitemap-0.xml',
    ...assets,
  ];
  const checks = await Promise.all([...pages, ...fixedAssets.map((file) => [`/${file}`, file])].map(async ([path, file, aliasTarget]) => ({
    path,
    ...(aliasTarget ? { aliasTarget } : {}),
    status: 200,
    body: await readFile(join(distDir, file)),
    mime: mimeTypes[extname(file)],
    maxAge: file.startsWith('_astro/') ? 31536000 : /\.(xml|txt)$/.test(file) ? 300 : 60,
    immutable: file.startsWith('_astro/'),
  })));
  checks.push({ path: '/posts', redirect: '/posts/' });
  checks.push({
    path: `/__deployment-check-missing-${randomUUID()}/`,
    status: 404,
    body: await readFile(join(distDir, '404.html')),
    mime: mimeTypes['.html'],
  });
  return checks;
}

const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

function withinSignal(promise, signal) {
  return new Promise((resolvePromise, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolvePromise, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function describeFetchFailure(error) {
  // Node fetch wraps TLS/DNS/socket errors in TypeError. Log only machine error
  // codes, never error.message, request URLs, headers, or certificate contents.
  const codes = new Set();
  const seen = new Set();
  const queue = [error];
  while (queue.length && seen.size < 12) {
    const item = queue.shift();
    if (!item || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    if (typeof item.code === 'string' && item.code.length <= 96 &&
        /^(?:ERR_(?:SSL|TLS)_[A-Z0-9_/]+|UND_ERR_[A-Z_]+|E[A-Z0-9_]+|CERT_[A-Z_]+|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_[A-Z_]+)$/.test(item.code)) {
      codes.add(item.code);
    }
    if (item.cause) queue.push(item.cause);
    if (Array.isArray(item.errors)) queue.push(...item.errors.slice(0, 8));
  }
  const name = ['TypeError', 'Error', 'AggregateError'].includes(error?.name) ? error.name : 'Error';
  const details = [...codes];
  let hint = '';
  if (details.some((code) => /SSL|TLS|CERT|UNABLE_TO_(?:VERIFY|GET_ISSUER)/.test(code))) {
    hint = ' TLS negotiation or certificate validation failed; check CDN HTTPS is enabled and its certificate covers the requested hostname.';
  } else if (details.some((code) => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))) {
    hint = ' DNS resolution failed; check the domain CNAME and DNS propagation.';
  } else if (details.some((code) => ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(code))) {
    hint = ' Connection failed; check the HTTPS listener and network reachability.';
  }
  return `GET failed (${[name, ...details].join('; ')}).${hint}`;
}

async function checkResponse(origin, check, { fetchImpl, requestTimeoutMs, signal }) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new Error('GET timeout')), requestTimeoutMs);
  const requestSignal = AbortSignal.any([timeout.signal, ...(signal ? [signal] : [])]);
  try {
    requestSignal.throwIfAborted();
    const queryStart = check.path.indexOf('?');
    const url = new URL(encodedPath(queryStart < 0 ? check.path : check.path.slice(0, queryStart)), origin);
    // Preserve an explicitly tested query; never introduce cache-busting parameters.
    if (queryStart >= 0) url.search = check.path.slice(queryStart);
    const response = await withinSignal(fetchImpl(url, { redirect: 'manual', signal: requestSignal }), requestSignal);
    const errors = [];
    // A CDN may redirect a short link before OSS serves its static fallback.
    // Only known aliases allow this alternative; normal pages/assets stay byte-exact.
    if (check.aliasTarget && [301, 302, 307, 308].includes(response.status)) {
      const target = new URL(check.aliasTarget, origin);
      target.search = url.search;
      const location = response.headers.get('location');
      try {
        if (!location || new URL(location, url).href !== target.href) {
          errors.push('alias redirect must retain the requested origin and query and point to its configured game page');
        }
      } catch {
        errors.push('invalid alias redirect Location');
      }
      await withinSignal(response.body?.cancel(), requestSignal);
      return errors;
    }
    if (check.redirect) {
      if (![301, 302, 307, 308].includes(response.status)) errors.push(`expected a directory redirect, received HTTP ${response.status}`);
      const location = response.headers.get('location');
      try {
        if (!location || new URL(location, url).href !== new URL(check.redirect, origin).href) {
          errors.push('redirect must retain the requested origin and point to /posts/');
        }
      } catch {
        errors.push('invalid redirect Location');
      }
      await withinSignal(response.body?.cancel(), requestSignal);
      return errors;
    }
    if (response.status !== check.status) errors.push(`expected HTTP ${check.status}, received HTTP ${response.status}`);
    const mime = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (!check.mime.includes(mime)) errors.push(`unexpected Content-Type ${JSON.stringify(mime)}`);
    if (/^\s*attachment(?:\s*;|\s*$)/i.test(response.headers.get('content-disposition') || '')) {
      errors.push('Content-Disposition forces a download');
    }
    if (check.maxAge !== undefined) {
      const directives = (response.headers.get('cache-control') || '').toLowerCase().split(',').map((part) => part.trim());
      const ages = directives.filter((part) => /^max-age\s*=/.test(part));
      if (ages.length !== 1 || !new RegExp(`^max-age\\s*=\\s*"?${check.maxAge}"?$`).test(ages[0])) {
        errors.push(`Cache-Control must specify max-age=${check.maxAge}`);
      }
      if (directives.some((part) => /^(no-store|no-cache|private)(?:\s*=|$)/.test(part))) {
        errors.push('Cache-Control unexpectedly prevents public caching');
      }
      if (check.immutable && !directives.includes('immutable')) errors.push('hashed asset is missing immutable');
      if (!check.immutable && directives.includes('immutable')) errors.push('mutable file must not be immutable');
    }
    const body = Buffer.from(await withinSignal(response.arrayBuffer(), requestSignal));
    if (!body.equals(check.body)) errors.push('response bytes differ from the validated release artifact');
    return errors;
  } catch (error) {
    // Keep response bodies and error URLs out of CI logs.
    return [requestSignal.aborted ? 'GET timed out or the overall verification deadline expired' : describeFetchFailure(error)];
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyDeployment(origin, {
  distDir = 'dist', checks, fetchImpl = fetch, requestTimeoutMs = 15000, signal,
} = {}) {
  origin = validateOrigin(origin);
  checks ??= await createDeploymentChecks(distDir);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 15000) {
    throw new Error('requestTimeoutMs must be an integer from 1 to 15000.');
  }
  const failures = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, checks.length) }, async () => {
    while (next < checks.length) {
      const check = checks[next++];
      const errors = await checkResponse(origin, check, { fetchImpl, requestTimeoutMs, signal });
      if (errors.length) failures.push({ path: check.path, errors });
    }
  }));
  return { ok: failures.length === 0, checked: checks.length, failures };
}

export async function verifyWithRetries(origin, {
  maxDurationMs = 340000, retryIntervalMs = 20000, log = console.log, ...options
} = {}) {
  origin = validateOrigin(origin);
  if (!Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 600000 ||
      !Number.isInteger(retryIntervalMs) || retryIntervalMs < 0) {
    throw new Error('Verification duration must be 1–600000 ms and retry interval must be nonnegative.');
  }
  const checks = options.checks ?? await createDeploymentChecks(options.distDir);
  log(`Verifying HTTPS release at ${origin} (up to ${maxDurationMs / 1000}s).`);
  const deadline = Date.now() + maxDurationMs;
  const signal = AbortSignal.any([AbortSignal.timeout(maxDurationMs), ...(options.signal ? [options.signal] : [])]);
  let result;
  let attempts = 0;
  do {
    attempts++;
    result = await verifyDeployment(origin, { ...options, checks, signal });
    if (result.ok) {
      log(`Verified ${origin}: ${result.checked} release checks passed (attempt ${attempts}).`);
      return { ...result, attempts };
    }
    for (const failure of result.failures) log(`${failure.path}: ${failure.errors.join('; ')}`);
    if (signal.aborted || Date.now() + retryIntervalMs >= deadline) break;
    log(`Verification has not passed; retrying in ${retryIntervalMs / 1000}s while CDN caches expire.`);
    try {
      await sleep(retryIntervalMs, undefined, { signal });
    } catch {
      break;
    }
  } while (!signal.aborted);
  return { ...result, ok: false, attempts };
}

function millisecondsFromEnv(name, fallback) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive number of milliseconds.`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length < 3 || process.argv.length > 4) throw new Error('Usage: node scripts/verify-deployment.mjs <https-origin> [dist-directory]');
    const result = await verifyWithRetries(process.argv[2], {
      distDir: process.argv[3] || 'dist',
      maxDurationMs: millisecondsFromEnv('DEPLOY_VERIFY_TIMEOUT_MS', 340000),
      retryIntervalMs: millisecondsFromEnv('DEPLOY_VERIFY_RETRY_MS', 20000),
      requestTimeoutMs: millisecondsFromEnv('DEPLOY_VERIFY_REQUEST_TIMEOUT_MS', 15000),
    });
    if (!result.ok) {
      console.error(`Deployment verification failed after ${result.attempts} attempt(s).`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Deployment verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}

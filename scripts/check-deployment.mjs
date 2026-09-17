import assert from 'node:assert/strict';
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';

// This runs without npm ci in the deploy job, before obtaining cloud credentials.
const requiredVariables = ['OSS_BUCKET', 'OSS_REGION', 'OSS_ENDPOINT', 'CDN_DOMAIN', 'ALIBABA_OIDC_PROVIDER_ARN', 'ALIBABA_DEPLOY_ROLE_ARN'];
for (const name of requiredVariables) assert.ok(process.env[name]?.trim(), `Missing production variable: ${name}`);
assert.match(process.env.OSS_BUCKET, /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Invalid OSS bucket name');
assert.match(process.env.OSS_REGION, /^[a-z0-9]+(?:-[a-z0-9]+)+$/, 'Use a region such as cn-shanghai');
const endpoint = new URL(process.env.OSS_ENDPOINT);
assert.equal(endpoint.protocol, 'https:', 'OSS_ENDPOINT must use HTTPS');
assert.equal(endpoint.origin, process.env.OSS_ENDPOINT.replace(/\/$/, ''), 'OSS_ENDPOINT must be an origin without credentials or a path');
const cdn = new URL(`https://${process.env.CDN_DOMAIN}`);
assert.equal(cdn.hostname, process.env.CDN_DOMAIN, 'CDN_DOMAIN must be a bare hostname');
assert.notEqual(endpoint.hostname, cdn.hostname, 'Upload directly to OSS, not through the CDN');
const provider = process.env.ALIBABA_OIDC_PROVIDER_ARN.match(/^acs:ram::(\d+):oidc-provider\/[\w-]+$/);
const role = process.env.ALIBABA_DEPLOY_ROLE_ARN.match(/^acs:ram::(\d+):role\/[\w-]+$/);
assert.ok(provider && role && provider[1] === role[1], 'Provider and role must be valid ARNs in the same account');

const gameFiles = ['conway-soldiers', 'conway-soldiers-3d'].flatMap((slug) => [
  `projects/${slug}/index.html`, `play/${slug}/src/app.js`, `play/${slug}/src/styles.css`, `play/${slug}/sounds/move.wav`,
]);
const requiredFiles = ['index.html', '404.html', 'posts/index.html', 'about/index.html', 'projects/index.html', ...gameFiles, 'coso/index.html', 'coso3d/index.html', 'rss.xml', 'robots.txt', 'sitemap-index.xml', 'sitemap-0.xml'];
for (const file of requiredFiles) assert.ok((await lstat(join('dist', file))).isFile(), `Missing artifact: ${file}`);
assert.ok((await readdir('dist/_astro')).length > 0, 'Missing hashed Astro resources');
let count = 0;
for (const file of await readdir('dist', { recursive: true })) {
  const info = await lstat(join('dist', file));
  assert.ok(!info.isSymbolicLink(), `Symlinks are not deployable: ${file}`);
  if (!info.isFile()) continue;
  assert.ok(!file.split(/[\\/]/).some((part) => part.startsWith('.')), `Hidden artifact: ${file}`);
  // Keep the minimal role sufficient: larger files need reviewed multipart rights.
  assert.ok(info.size < 100 * 1024 * 1024, `Review multipart permissions before uploading >=100 MiB: ${file}`);
  count++;
}
const home = await readFile('dist/index.html', 'utf8');
const canonicalLinks = [...home.matchAll(/<link\b[^>]*>/gi)]
  .map(([tag]) => tag).filter((tag) => /\brel\s*=\s*(["'])canonical\1/i.test(tag));
assert.equal(canonicalLinks.length, 1, 'Homepage must have exactly one canonical link');
assert.equal(canonicalLinks[0].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2], `${cdn.origin}/`, 'Build canonical does not match CDN_DOMAIN; check repository SITE_URL');
assert.ok(!/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(home), 'Homepage is marked noindex');
assert.ok(!/^Disallow:\s*\/\s*$/im.test(await readFile('dist/robots.txt', 'utf8')), 'robots.txt blocks the whole site');
console.log(`Deployment preflight passed: ${count} files, bucket ${process.env.OSS_BUCKET}, region ${process.env.OSS_REGION}.`);

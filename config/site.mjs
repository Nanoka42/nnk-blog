import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

// The only production-origin configuration. Local builds stay useful without a domain.
export const siteUrl = process.env.SITE_URL || 'http://localhost:4321';
const origin = new URL(siteUrl);
if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
  throw new Error('SITE_URL must be an HTTP(S) origin without a path, credentials, query, or fragment.');
}
export const isLocalSite = ['localhost', '127.0.0.1'].includes(origin.hostname);
if (!isLocalSite && origin.protocol !== 'https:') throw new Error('Production SITE_URL must use HTTPS.');

if (process.env.REQUIRE_PRODUCTION_SITE === '1' && isLocalSite) {
  throw new Error('Release build requires SITE_URL=https://nanoka.tv (or another approved production origin).');
}

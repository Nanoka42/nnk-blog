import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const config = new URL('../config/site.mjs', import.meta.url).href;
function readConfig(site, release = false) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(config)})`], {
    env: { ...process.env, SITE_URL: site, REQUIRE_PRODUCTION_SITE: release ? '1' : '0' },
    encoding: 'utf8',
  });
}

test('local builds are allowed but release builds require a valid production HTTPS origin', () => {
  assert.equal(readConfig('').status, 0);
  assert.notEqual(readConfig('', true).status, 0);
  assert.equal(readConfig('https://nanoka.tv', true).status, 0);
  for (const origin of ['http://localhost:4321', 'http://nanoka.tv', 'https://nanoka.tv/blog/', 'https://nanoka.tv/?secret=1', 'https://user:password@nanoka.tv', 'not-a-url']) {
    assert.notEqual(readConfig(origin, true).status, 0, origin);
  }
});

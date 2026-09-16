import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectOssReports, redactOssReport } from '../scripts/report-oss-errors.mjs';

test('diagnostics retain OSS error details without archiving credentials or signed URL queries', () => {
  const env = { OSS_ACCESS_KEY_ID: 'STS.example-key', OSS_ACCESS_KEY_SECRET: 'test-secret-value', OSS_SESSION_TOKEN: 'test+token/with=encoding' };
  const input = `Error Code: AccessDenied; Request Id: example-request; EC: 0003-00000001\n${Object.values(env).join('\n')}\n${encodeURIComponent(env.OSS_SESSION_TOKEN)}\nRequest Endpoint: PUT https://oss-origin.example/asset.css?signature=unlisted-value\nAuthorization: unlisted-auth\n<SecurityToken>unlisted-token</SecurityToken>`;
  const output = redactOssReport(input, env);
  for (const value of [...Object.values(env), encodeURIComponent(env.OSS_SESSION_TOKEN), 'unlisted-value', 'unlisted-auth', 'unlisted-token']) assert.ok(!output.includes(value));
  assert.match(output, /Error Code: AccessDenied; Request Id: example-request; EC: 0003-00000001/);
  assert.match(output, /https:\/\/oss-origin\.example\/asset\.css/);
});

test('collector saves only sanitized reports and handles missing reports', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nanoka-oss-diagnostics-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, 'sanitized');
  const raw = 'operation error PutObject; Error Code: AccessDenied; example-private-secret';
  await writeFile(join(directory, 'upload.report'), raw);
  await writeFile(join(directory, 'unrelated.log'), 'do not collect debug logs');
  const output = await collectOssReports(directory, destination, { OSS_ACCESS_KEY_SECRET: 'example-private-secret' });
  assert.match(output, /PutObject; Error Code: AccessDenied; \[REDACTED\]/);
  assert.ok(!output.includes('debug logs'));
  assert.equal(await readFile(join(destination, 'ossutil-report.txt'), 'utf8'), output);
  assert.equal(await readFile(join(directory, 'upload.report'), 'utf8'), raw);
  assert.match(await collectOssReports(join(directory, 'absent'), destination, {}), /No ossutil .report file/);
});

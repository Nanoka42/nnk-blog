import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { games } from '../config/games.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const game of games) {
  const source = resolve(root, game.source);
  const tests = (await readdir(resolve(source, 'tests'))).filter((file) => file.endsWith('.test.js')).sort();
  if (!tests.length) throw new Error(`No tests found for ${game.slug}`);
  console.log(`Testing ${game.slug}`);
  execFileSync(process.execPath, ['--test', ...tests.map((file) => `tests/${file}`)], { cwd: source, stdio: 'inherit' });
}

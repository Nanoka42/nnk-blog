import { cp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'conway_checker_game');
const built = resolve(source, 'dist');
const destination = resolve(root, 'public/play/conway-soldiers');
const generated = resolve(root, '.generated');
for (const target of [built, destination]) {
  const within = relative(root, target);
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error(`Unsafe generated target: ${target}`);
  // Only these exact generated folders are replaced. The original game source is untouched.
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: source, stdio: 'inherit' });
await mkdir(destination, { recursive: true });
await cp(built, destination, { recursive: true, filter: (path) => path !== resolve(built, 'index.html') });
await mkdir(generated, { recursive: true });
await writeFile(resolve(generated, 'conway.html'), await readFile(resolve(built, 'index.html'), 'utf8'));
console.log('Game prepared at public/play/conway-soldiers/');

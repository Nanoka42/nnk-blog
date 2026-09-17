import { cp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { games } from '../config/games.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const generated = resolve(root, '.generated');
await mkdir(generated, { recursive: true });
// Remove the previous single-game integration artifact after the directory migration.
await rm(resolve(generated, 'conway.html'), { force: true });
for (const game of games) {
  const source = resolve(root, game.source);
  const built = resolve(source, 'dist');
  const destination = resolve(root, `public${game.assetPath}`);
  const within = relative(root, destination);
  if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error(`Unsafe generated target: ${destination}`);
  // Replace only this registered game's generated public resources.
  await rm(destination, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: source, stdio: 'inherit' });
  await mkdir(destination, { recursive: true });
  await cp(built, destination, { recursive: true, filter: (path) => path !== resolve(built, 'index.html') });
  await writeFile(resolve(generated, `${game.slug}.html`), await readFile(resolve(built, 'index.html'), 'utf8'));
  console.log(`Game prepared at public${game.assetPath}`);
}

import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
const root = resolve(import.meta.dirname, '..'), output = join(root, 'dist');
if (relative(root, output) !== 'dist') throw new Error('Build output must be the project dist directory.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(join(root, 'index.html'), join(output, 'index.html'));
for (const directory of ['src', 'sounds']) {
  await mkdir(join(output, directory), { recursive: true });
  for (const file of await readdir(join(root, directory), { withFileTypes: true })) {
    if (file.isFile() && /\.(?:js|css|wav|svg)$/.test(file.name))
      await copyFile(join(root, directory, file.name), join(output, directory, file.name));
  }
}
console.log('3D game built in dist/. All runtime resources are local.');

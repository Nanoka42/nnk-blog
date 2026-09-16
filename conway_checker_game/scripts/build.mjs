import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
// Optional local static build; no cloud provider or generated framework runtime.
const root = resolve(import.meta.dirname, '..'), output = join(root, 'dist');
await mkdir(output, { recursive: true });
await copyFile(join(root, 'index.html'), join(output, 'index.html'));
for (const directory of ['src', 'icons', 'sounds']) {
  await mkdir(join(output, directory), { recursive: true });
  for (const file of await readdir(join(root, directory), { withFileTypes: true })) {
    if (!file.isFile() || !/\.(?:js|css|png|wav)$/.test(file.name)) continue;
    await copyFile(join(root, directory, file.name), join(output, directory, file.name));
  }
}
console.log('Static files are ready in dist/.');

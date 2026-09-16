import { execFileSync } from 'node:child_process';

// Use npm's current JS entry point rather than a platform-specific npm.cmd shell.
execFileSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, REQUIRE_PRODUCTION_SITE: '1' },
  stdio: 'inherit',
});

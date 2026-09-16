import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import type { AstroInlineConfig } from 'astro';

type ServerCommand = 'dev' | 'preview';
type ServerMessage = { type: 'ready'; port: number } | { type: 'stopped' };
const root = fileURLToPath(new URL('../../', import.meta.url));

// Each server owns an isolated NODE_ENV, Vite instance and Astro content layer.
// Node 24 loads this erasable TypeScript worker directly, without Playwright's loader.
async function serve(command: ServerCommand) {
  const port = parentPort!;
  const { dev, preview } = await import('astro');
  const options: AstroInlineConfig = {
    root,
    mode: command === 'dev' ? 'development' : 'production',
    server: { host: '127.0.0.1', port: 0, open: false },
    logLevel: 'warn',
    devToolbar: { enabled: false },
  };
  const server = await (command === 'dev' ? dev(options) : preview(options));
  port.once('message', async () => {
    await server.stop();
    port.postMessage({ type: 'stopped' } satisfies ServerMessage);
    port.close();
  });
  port.postMessage({
    type: 'ready',
    port: 'address' in server ? server.address.port : server.port,
  } satisfies ServerMessage);
}

if (!isMainThread) await serve(workerData as ServerCommand);

function waitFor(worker: Worker, type: ServerMessage['type'], timeout: number): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };
    const onMessage = (message: ServerMessage) => {
      if (message.type !== type) return;
      cleanup();
      resolve(message);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onExit = (code: number) => onError(new Error(`Astro worker exited before ${type} (code ${code}).`));
    const timer = setTimeout(() => onError(new Error(`Astro worker did not report ${type} within ${timeout} ms.`)), timeout);
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
  });
}

async function startServer(command: ServerCommand) {
  const worker = new Worker(new URL(import.meta.url), {
    workerData: command,
    // Do not inherit Playwright's TypeScript loader hooks into the server worker.
    execArgv: [],
    env: {
      ...process.env,
      NODE_ENV: command === 'dev' ? 'development' : 'production',
      ASTRO_TELEMETRY_DISABLED: '1',
      ASTRO_DISABLE_UPDATE_CHECK: 'true',
    },
  });
  // Keep an error listener after startup so worker errors become teardown failures,
  // rather than an unhandled EventEmitter error in the Playwright runner.
  let failure: Error | undefined;
  worker.on('error', (error) => { failure = error; });
  let message: ServerMessage;
  try {
    message = await waitFor(worker, 'ready', 60000);
  } catch (error) {
    await worker.terminate();
    throw error;
  }
  if (message.type !== 'ready') throw new Error(`Astro ${command} did not report a port.`);
  return {
    url: `http://127.0.0.1:${message.port}/`,
    async stop() {
      try {
        if (failure) throw failure;
        const stopped = waitFor(worker, 'stopped', 15000);
        worker.postMessage('stop');
        await stopped;
      } finally {
        // stop() closes HTTP, HMR and watchers first. Reclaim the owned worker even
        // if an integration leaves a timer open; no shell or process-tree kill is used.
        await worker.terminate();
      }
    },
  };
}

export default async function globalSetup() {
  try {
    await access(new URL('../../dist/index.html', import.meta.url));
    await access(new URL('../../.generated/conway.html', import.meta.url));
  } catch {
    throw new Error('Browser tests require built dist and game files. Run npm run build first.');
  }
  const previous = {
    PLAYWRIGHT_TEST_BASE_URL: process.env.PLAYWRIGHT_TEST_BASE_URL,
    PLAYWRIGHT_PRODUCTION_BASE_URL: process.env.PLAYWRIGHT_PRODUCTION_BASE_URL,
  };
  const servers: Awaited<ReturnType<typeof startServer>>[] = [];
  const teardown = async () => {
    // Attempt every stop even when one server fails to close.
    const results = await Promise.allSettled(servers.map((server) => server.stop()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Failed to close Astro test servers.');
  };
  try {
    const development = await startServer('dev');
    servers.push(development);
    process.env.PLAYWRIGHT_TEST_BASE_URL = development.url;
    const production = await startServer('preview');
    servers.push(production);
    process.env.PLAYWRIGHT_PRODUCTION_BASE_URL = production.url;
    console.log(`Browser test servers: development ${development.url}; production ${production.url}`);
    return teardown;
  } catch (error) {
    await teardown();
    throw error;
  }
}

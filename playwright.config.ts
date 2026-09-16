import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './tests/browser/global-setup.ts',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', testIgnore: '**/production.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', testIgnore: '**/production.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'mobile', testIgnore: '**/production.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'production', testMatch: '**/production.spec.ts', use: { ...devices['Desktop Chrome'] } },
  ],
});

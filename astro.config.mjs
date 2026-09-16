import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeSlug from 'rehype-slug';
import { remarkMathSource, rehypeReading } from './src/plugins/markdown.mjs';
import { siteUrl } from './config/site.mjs';
import { isRedirectPath } from './config/redirects.mjs';

export const markdown = {
  processor: unified({
    gfm: true,
    remarkPlugins: [remarkMath, remarkMathSource],
    rehypePlugins: [rehypeSlug, rehypeReading],
  }),
  shikiConfig: {
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: false,
    wrap: false,
    transformers: [{
      name: 'preserve-code-source',
      pre(node) {
        node.properties['data-code-source'] = this.source;
        node.properties['data-code-language'] = this.options.lang;
      },
    }],
  },
};

export default defineConfig({
  site: siteUrl,
  output: 'static',
  // Accept bare short links in dev/preview; exported URLs and canonicals keep '/'.
  // OSS uses its directory-index redirect, and CDN can redirect aliases directly.
  trailingSlash: 'ignore',
  // Port 0 lets the OS choose an available port, including on Windows with reserved ranges.
  server: { host: '127.0.0.1', port: 0 },
  build: { format: 'directory' },
  vite: { server: { watch: { ignored: ['**/conway_checker_game/**', '**/public/play/**', '**/.generated/**'] } } },
  integrations: [sitemap({
    filter: (page) => !['/404/', '/404.html'].includes(new URL(page).pathname) && !isRedirectPath(new URL(page).pathname),
  })],
  markdown,
});

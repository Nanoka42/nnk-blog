import type { APIContext } from 'astro';
import { isLocalSite } from '../../config/site.mjs';
export function GET({ site }: APIContext) {
  return new Response(`User-agent: *\n${isLocalSite ? 'Disallow: /' : 'Allow: /'}\nSitemap: ${new URL('sitemap-index.xml', site)}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

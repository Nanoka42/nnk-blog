// Standalone source lives in apps/; the blog publishes pages and assets separately.
// No npm workspace or runtime package is needed by these native ES module games.
export const games = [
  { slug: 'conway-soldiers', source: 'apps/conway-soldiers' },
  { slug: 'conway-soldiers-3d', source: 'apps/conway-soldiers-3d' },
].map((game) => ({
  ...game,
  pagePath: `/projects/${game.slug}/`,
  assetPath: `/play/${game.slug}/`,
}));

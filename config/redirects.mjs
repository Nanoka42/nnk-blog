import { games } from './games.mjs';

export const conwayPath = games.find((game) => game.slug === 'conway-soldiers').pagePath;
export const conway3dPath = games.find((game) => game.slug === 'conway-soldiers-3d').pagePath;
// These finite sets exactly cover both supported short-link regular expressions.
export const conwayAliases = ['conway', 'conways'].flatMap((name) =>
  ['', '_', '-'].flatMap((separator) =>
    ['soldier', 'checker'].flatMap((piece) => ['', 's'].map((plural) => `${name}${separator}${piece}${plural}`))));
export const conway3dAliases = conwayAliases.flatMap((alias) => ['', '_', '-'].map((separator) => `${alias}${separator}3d`));
export const redirects = Object.fromEntries([
  ...[...conwayAliases, 'coso', 'play/conway-soldiers'].map((path) => [`/${path}/`, conwayPath]),
  ...[...conway3dAliases, 'coso3d', 'play/conway-soldiers-3d'].map((path) => [`/${path}/`, conway3dPath]),
]);
export const redirectPaths = Object.keys(redirects).map((path) => path.slice(1, -1));
export const isRedirectPath = (pathname) => Object.hasOwn(redirects, `${pathname.replace(/\/$/, '')}/`);

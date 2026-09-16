// This finite set exactly covers ^conways?[_-]?(?:soldier|checker)s?$.
export const conwayPath = '/projects/conway-soldiers/';
export const conwayAliases = ['conway', 'conways'].flatMap((name) =>
  ['', '_', '-'].flatMap((separator) =>
    ['soldier', 'checker'].flatMap((piece) => ['', 's'].map((plural) => `${name}${separator}${piece}${plural}`))));
export const redirectPaths = [...conwayAliases, 'coso', 'play/conway-soldiers'];
export const redirects = Object.fromEntries(redirectPaths.map((path) => [`/${path}/`, conwayPath]));
export const isRedirectPath = (pathname) => Object.hasOwn(redirects, `${pathname.replace(/\/$/, '')}/`);

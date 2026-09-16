import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conwayAliases, conwayPath, redirects, isRedirectPath } from '../config/redirects.mjs';

test('the complete finite short-link language redirects to the primary game route', () => {
  assert.equal(new Set(conwayAliases).size, 24);
  for (const alias of conwayAliases) {
    assert.match(alias, /^conways?[_-]?(?:soldier|checker)s?$/);
    assert.equal(redirects[`/${alias}/`], conwayPath);
    assert.equal(isRedirectPath(`/${alias}`), true);
    assert.equal(isRedirectPath(`/${alias}/`), true);
  }
  assert.equal(redirects['/coso/'], conwayPath);
  assert.equal(redirects['/play/conway-soldiers/'], conwayPath);
  for (const path of ['/conway', '/conway-checkerss', '/conway__checker', '/x/conwaychecker', '/cosos', '/COSO', conwayPath]) {
    assert.equal(isRedirectPath(path), false, path);
  }
});

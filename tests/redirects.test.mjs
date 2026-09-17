import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conwayAliases, conwayPath, conway3dAliases, conway3dPath, redirects, isRedirectPath } from '../config/redirects.mjs';

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

test('3D short links cover all 72 spellings without redirecting unrelated paths or assets', () => {
  assert.equal(new Set(conway3dAliases).size, 72);
  assert.equal(Object.keys(redirects).length, 100);
  for (const alias of conway3dAliases) {
    assert.match(alias, /^conways?[_-]?(?:soldier|checker)s?[_-]?3d$/);
    assert.equal(redirects[`/${alias}/`], conway3dPath);
    assert.equal(isRedirectPath(`/${alias}`), true);
    assert.equal(isRedirectPath(`/${alias}/`), true);
  }
  assert.equal(redirects['/coso3d/'], conway3dPath);
  assert.equal(redirects['/play/conway-soldiers-3d/'], conway3dPath);
  for (const path of ['/conway3d', '/conway-checkerss3d', '/conway__checker3d', '/conway-checker--3d', '/conway-soldier-3d-extra', '/x/conwaychecker3d', '/cosos3d', '/coso-3d', '/COSO3D', '/conway-soldiers-3D', conway3dPath, '/play/conway-soldiers-3d/src/app.js', '/play/conway-soldiers/src/app.js']) {
    assert.equal(isRedirectPath(path), false, path);
  }
});

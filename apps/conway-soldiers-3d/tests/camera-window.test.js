import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, CAMERA_LIMIT, MIN_ZOOM, MAX_ZOOM, MIN_PLANE_SCALE } from '../src/camera.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
const nearPoint = (actual, expected) => expected.forEach((value, axis) => near(actual[axis], value));

const cameraAt = (width = 1800, height = 900) => {
  const c = new Camera();
  c.resize(width, height);
  return c;
};

test('crossing the side-view guard keeps exactly the same XZ working window', () => {
  const c = cameraAt();
  const ordinary = c.bounds();
  for (const pitch of [-.85, -.27, 0, .27, .85]) {
    c.pitch = pitch;
    const boundary = Math.acos(MIN_PLANE_SCALE / Math.cos(pitch));
    for (const sign of [-1, 1]) {
      c.yaw = sign * (boundary - .0001);
      assert.equal(c.pickable, true);
      assert.deepEqual(c.bounds(), ordinary);
      c.yaw = sign * (boundary + .0001);
      assert.equal(c.pickable, false);
      assert.deepEqual(c.bounds(), ordinary);
      assert.equal(c.world(...c.midpoint), null);
      assert.equal(c.hit(...c.midpoint), null);
    }
  }
});

test('both sides of either plane cross the shallower guard without changing the working window', () => {
  for (const plane of ['XZ', 'XY']) for (const sign of [-1, 1]) for (const yawSign of [-1, 1]) {
    const c = cameraAt(); c.setPlane(plane); c.target = [12.3, -4.6, 2.37];
    const bounds = c.bounds();
    for (const scale of [MIN_PLANE_SCALE - 1e-6, MIN_PLANE_SCALE + 1e-6, .47]) {
      c.pitch = plane === 'XY' ? Math.asin(sign * scale) : .27;
      c.yaw = plane === 'XY' ? yawSign * 1.8 : yawSign * Math.acos(sign * scale / Math.cos(c.pitch));
      near(c.normalDepth, sign * scale);
      assert.equal(c.pickable, scale > MIN_PLANE_SCALE);
      assert.deepEqual(c.bounds(), bounds);
      const point = c.point(12, Math.round(c.center[1])), screen = c.screen(...point);
      if (c.pickable) {
        nearPoint(c.world(...screen.slice(0, 2)), point);
        assert.deepEqual(c.hit(...screen), point);
      } else {
        assert.equal(c.world(...screen.slice(0, 2)), null);
        assert.equal(c.hit(...screen), null);
      }
    }
  }
});

test('desktop and phone windows remain fixed through a full orbit and pitch range', () => {
  for (const plane of ['XZ', 'XY']) for (const [width, height] of [[320, 450], [390, 600], [800, 650], [1800, 900]]) {
    const c = cameraAt(width, height);
    c.setPlane(plane);
    c.center = [12.3, -4.6];
    c.slice = 8;
    for (const zoom of [MIN_ZOOM, 1, 3]) {
      c.zoom = zoom;
      const bounds = c.bounds();
      for (const pitch of [-Math.PI / 2, -.85, 0, .27, .85, Math.PI / 2]) for (let step = 0; step <= 24; step++) {
        c.yaw = -Math.PI + step * Math.PI / 12;
        c.pitch = pitch;
        assert.deepEqual(c.bounds(), bounds);
      }
    }
  }
});

test('working window still follows zoom, resize and pan', () => {
  const c = cameraAt(600, 700);
  const initial = c.bounds();
  c.zoomAt(2, ...c.midpoint);
  const zoomed = c.bounds();
  assert.ok(zoomed.maxX - zoomed.minX < initial.maxX - initial.minX);
  assert.ok(zoomed.maxZ - zoomed.minZ < initial.maxZ - initial.minZ);
  c.zoom = 1;
  c.resize(1200, 700);
  const resized = c.bounds();
  assert.ok(resized.maxX - resized.minX > initial.maxX - initial.minX);
  c.face();
  c.pan(c.cell * 2, -c.cell * 3);
  assert.deepEqual(c.bounds(), {
    minX: resized.minX - 2, maxX: resized.maxX - 2,
    minY: 0, maxY: 0,
    minZ: resized.minZ - 3, maxZ: resized.maxZ - 3,
  });
});

test('fixed working window retains the 31 by 31 cap and coordinate limits', () => {
  const c = cameraAt(10000, 10000);
  c.zoom = MIN_ZOOM;
  for (const plane of ['XZ', 'XY']) for (const x of [-CAMERA_LIMIT, 0, CAMERA_LIMIT]) for (const v of [-CAMERA_LIMIT, 0, CAMERA_LIMIT]) {
    c.setPlane(plane); c.center = [x, v];
    const bounds = c.bounds();
    assert.ok(bounds.maxX - bounds.minX <= 30);
    assert.ok(bounds[`max${c.verticalLabel}`] - bounds[`min${c.verticalLabel}`] <= 30);
    assert.equal(bounds[`min${c.normalLabel}`], c.slice);
    assert.equal(bounds[`max${c.normalLabel}`], c.slice);
    assert.ok(Object.values(bounds).every(value => Number.isInteger(value) && Math.abs(value) <= CAMERA_LIMIT));
    assert.ok(bounds.minX <= x && bounds.maxX >= x);
    assert.ok(bounds[`min${c.verticalLabel}`] <= v && bounds[`max${c.verticalLabel}`] >= v);
    c.yaw = Math.PI / 2;
    assert.deepEqual(c.bounds(), bounds);
  }
});

test('changing work planes with a selection preserves every world projection exactly', () => {
  const c = cameraAt();
  c.target = [8.2, -3.4, 6.7]; c.zoom = 1.63; c.yaw = -.73; c.pitch = -.91;
  const selection = [10, -5, 8], points = [selection, [2, 4, 7], [-3, 6, -4]];
  const state = { target: [...c.target], zoom: c.zoom, yaw: c.yaw, pitch: c.pitch };
  const screens = points.map(point => c.screen(...point));
  assert.equal(c.setPlane('XY', selection), true);
  assert.equal(c.slice, selection[2]);
  assert.deepEqual(c.center, [state.target[0], state.target[1]]);
  assert.deepEqual(points.map(point => c.screen(...point)), screens);
  assert.deepEqual(c.target, state.target); assert.equal(c.zoom, state.zoom);
  assert.equal(c.yaw, state.yaw); assert.equal(c.pitch, state.pitch);
  assert.deepEqual(c.hit(...c.screen(...selection)), selection);
  assert.equal(c.setPlane('XZ', selection), true);
  assert.equal(c.slice, selection[1]);
  assert.deepEqual(points.map(point => c.screen(...point)), screens);
  assert.deepEqual(c.target, state.target);
});

test('unselected switches round only the slice and retain the fractional world-space view centre', () => {
  const c = cameraAt();
  c.target = [12.3, -4.6, 7.49];
  const target = [...c.target], before = c.screen(11, -4, 6);
  for (let i = 0; i < 20; i++) {
    c.setPlane('XY'); assert.equal(c.slice, 7);
    assert.deepEqual(c.target, target); assert.deepEqual(c.screen(...target).slice(0, 2), c.midpoint);
    c.setPlane('XZ'); assert.equal(c.slice, -5);
    assert.deepEqual(c.target, target); assert.deepEqual(c.screen(11, -4, 6), before);
  }
});

test('centre and ordinary slice navigation address the current plane axes', () => {
  const c = cameraAt();
  c.center = [3.2, -1.4]; c.slice = 5;
  assert.deepEqual(c.target, [3.2, 5, -1.4]);
  assert.deepEqual(c.point(2, 7), [2, 5, 7]);
  assert.equal(c.normalAxis, 1); assert.equal(c.verticalAxis, 2);
  c.setPlane('XY');
  assert.equal(c.normalAxis, 2); assert.equal(c.verticalAxis, 1);
  assert.equal(c.normalLabel, 'Z'); assert.equal(c.verticalLabel, 'Y');
  assert.deepEqual(c.center, [3.2, 5]);
  c.center = [8.3, 2.6];
  assert.deepEqual(c.target, [8.3, 2.6, -1.4]);
  c.slice = 4;
  assert.deepEqual(c.target, [8.3, 2.6, 4]);
  assert.deepEqual(c.point(2, 7), [2, 7, 4]);
  assert.deepEqual(c.point(2, 7, -8), [2, 7, -8]);
  const before = c.screen(2, 7, 4);
  c.slice = 9;
  assert.deepEqual(c.screen(2, 7, 9), before);
});

test('XY screen, world and hit roundtrips work from above and below at every yaw', () => {
  for (const [width, height] of [[320, 450], [390, 600], [1800, 900]]) {
    const c = cameraAt(width, height); c.setPlane('XY');
    c.target = [12.3, -4.6, 2.37];
    for (const pitch of [-Math.PI / 2, -1.1, -.6, .6, 1.1, Math.PI / 2]) for (const yaw of [0, .43, Math.PI / 2, -2.4, Math.PI]) {
      c.yaw = yaw; c.pitch = pitch;
      assert.equal(c.pickable, true);
      for (const point of [[12, -5, c.slice], [14, -2, c.slice], [11, -6, c.slice]]) {
        const p = c.screen(...point);
        nearPoint(c.world(p[0], p[1]), point);
        assert.deepEqual(c.hit(...p), point);
      }
    }
  }
});

test('inverse projection supports neighbouring slices with an independent camera target', () => {
  for (const plane of ['XZ', 'XY']) {
    const c = cameraAt(); c.setPlane(plane); c.home();
    c.target = [1.25, -2.5, 3.75];
    for (const slice of [-17, 0, 23]) {
      const point = c.point(4.3, -1.7, slice), screen = c.screen(...point);
      nearPoint(c.world(screen[0], screen[1], slice), point);
    }
  }
});

test('pan and anchored zoom preserve points after switching to a plane away from the target', () => {
  for (const plane of ['XZ', 'XY']) {
    const c = cameraAt(600, 700);
    c.setPlane(plane === 'XY' ? 'XZ' : 'XY');
    c.target = [1.2, -2.6, 3.4];
    c.setPlane(plane, [3, 5, 8]);
    c.yaw = -.6; c.pitch = plane === 'XY' ? -1.1 : .3;
    const anchor = [271, 238], world = c.world(...anchor), normal = c.target[c.normalAxis];
    c.zoomAt(1.7, ...anchor);
    nearPoint(c.world(...anchor), world);
    c.pan(41, -23);
    nearPoint(c.world(anchor[0] + 41, anchor[1] - 23), world);
    assert.equal(c.target[c.normalAxis], normal);
  }
});

test('side-on pan stays responsive in both screen directions and zoom remains anchored', () => {
  for (const plane of ['XZ', 'XY']) {
    const c = cameraAt(); c.setPlane(plane);
    c.yaw = Math.PI / 2; c.pitch = 0;
    assert.equal(c.pickable, false);
    const point = [2, -3, 5], before = c.screen(...point);
    c.pan(37, -29);
    const after = c.screen(...point);
    near(after[0], before[0] + 37); near(after[1], before[1] - 29);
    c.zoomAt(1.5, after[0], after[1]);
    nearPoint(c.screen(...point).slice(0, 2), after.slice(0, 2));
    assert.ok(c.target.every(Number.isFinite));
  }
});

test('XY picking guard depends on pitch while normal depth matches the projected depth', () => {
  const c = cameraAt(); c.setPlane('XY');
  const boundary = Math.asin(MIN_PLANE_SCALE);
  for (const pitch of [0, .2, -.2, boundary - 1e-6, -boundary + 1e-6]) {
    c.pitch = pitch; assert.equal(c.pickable, false); assert.equal(c.world(...c.midpoint), null);
  }
  for (const plane of ['XZ', 'XY']) for (const pitch of [-1.2, -.3, .3, 1.2]) for (const yaw of [-2, 0, 1.4]) {
    c.setPlane(plane); c.pitch = pitch; c.yaw = yaw;
    const a = c.screen(...c.point(0, 0, c.slice)), b = c.screen(...c.point(0, 0, c.slice + 1));
    near(c.normalDepth, (b[2] - a[2]) / c.cell);
  }
});

test('face and home respect the active plane; a XY front view has X right and Y up', () => {
  const c = cameraAt(600, 700); c.setPlane('XY');
  c.face();
  assert.equal(c.yaw, 0); assert.equal(c.pitch, -Math.PI / 2); assert.equal(c.pickable, true);
  const o = c.screen(0, 0, c.slice), x = c.screen(1, 0, c.slice), y = c.screen(0, 1, c.slice);
  near(x[0] - o[0], c.cell); near(x[1], o[1]); near(y[0], o[0]); near(y[1] - o[1], -c.cell);
  c.target = [4, 5, 6]; c.slice = 9; c.zoom = 2;
  c.home();
  assert.equal(c.plane, 'XY'); assert.deepEqual(c.target, [0, 0, 0]); assert.equal(c.slice, 0);
  assert.equal(c.zoom, 1); assert.equal(c.pickable, true); assert.equal(c.originVisible, true);
  c.setPlane('XZ'); c.home();
  assert.deepEqual(c.target, [0, 0, 2]); assert.equal(c.pitch, .27); assert.equal(c.yaw, .43);
});

test('both planes reject picks outside the finite window and on other slices', () => {
  for (const plane of ['XZ', 'XY']) {
    const c = cameraAt(1800, 650); c.setPlane(plane); c.face(); c.zoom = MIN_ZOOM;
    const point = c.point(5, 0), hidden = c.point(30, 0);
    assert.equal(c.inBounds(point), true); assert.deepEqual(c.hit(...c.screen(...point)), point);
    assert.equal(c.inBounds(hidden), false); assert.equal(c.hit(...c.screen(...hidden)), null);
    assert.equal(c.inBounds(c.point(5, 0, c.slice + 1)), false);
    assert.equal(c.inBounds([NaN, 0, 0]), false); assert.equal(c.inBounds(null), false);
  }
});

test('invalid inputs and orbit limits cannot poison camera coordinates', () => {
  const c = cameraAt();
  assert.equal(c.setPlane('YZ'), false); assert.equal(c.plane, 'XZ');
  assert.equal(c.setPlane('XZ', [99, 99, 99]), false); assert.equal(c.slice, 0);
  c.target = [Infinity, -Infinity, NaN]; assert.deepEqual(c.target, [0, 0, 0]);
  c.center = [1e20, -1e20]; assert.deepEqual(c.center, [CAMERA_LIMIT, -CAMERA_LIMIT]);
  c.setPlane('XY', [0, 0, NaN]); assert.equal(c.slice, -CAMERA_LIMIT);
  c.slice = Infinity; assert.equal(c.slice, 0); assert.equal(c.target[2], 0);
  c.yaw = NaN; c.pitch = Infinity;
  assert.ok(Number.isFinite(c.yaw)); assert.ok(Number.isFinite(c.pitch));
  const before = [c.yaw, c.pitch]; c.orbit(NaN, 1); c.orbit(1, Infinity);
  assert.deepEqual([c.yaw, c.pitch], before);
  c.orbit(1e20, 1e20); assert.equal(c.pitch, Math.PI / 2); assert.ok(Math.abs(c.yaw) <= Math.PI);
  c.orbit(-1e20, -1e20); assert.equal(c.pitch, -Math.PI / 2); assert.ok(Math.abs(c.yaw) <= Math.PI);
  c.home();
  for (const factor of [0, -1, NaN, Infinity]) c.zoomAt(factor, ...c.midpoint);
  assert.equal(c.zoom, 1);
  c.zoomAt(Number.MAX_VALUE, ...c.midpoint); assert.equal(c.zoom, MAX_ZOOM);
  c.zoomAt(Number.MIN_VALUE, ...c.midpoint); assert.equal(c.zoom, MIN_ZOOM);
  const target = [...c.target]; c.pan(NaN, 5); c.pan(5, Infinity); assert.deepEqual(c.target, target);
  assert.equal(c.world(NaN, 0), null); assert.equal(c.world(0, Infinity), null); assert.equal(c.world(0, 0, NaN), null);
  c.resize(NaN, Infinity); assert.equal(c.width, 1); assert.equal(c.height, 1);
  assert.ok(Object.values(c.bounds()).every(Number.isFinite));
});

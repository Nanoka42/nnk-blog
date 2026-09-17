import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, CAMERA_LIMIT, MIN_ZOOM } from '../src/camera.js';

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
    const boundary = Math.acos(.5 / Math.cos(pitch));
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

test('desktop and phone windows remain fixed through a full orbit and pitch range', () => {
  for (const [width, height] of [[320, 450], [390, 600], [800, 650], [1800, 900]]) {
    const c = cameraAt(width, height);
    c.center = [12.3, -4.6];
    c.slice = 8;
    for (const zoom of [MIN_ZOOM, 1, 3]) {
      c.zoom = zoom;
      const bounds = c.bounds();
      for (const pitch of [-.85, 0, .27, .85]) for (let step = 0; step <= 24; step++) {
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
    minZ: resized.minZ - 3, maxZ: resized.maxZ - 3,
  });
});

test('fixed working window retains the 31 by 31 cap and coordinate limits', () => {
  const c = cameraAt(10000, 10000);
  c.zoom = MIN_ZOOM;
  for (const x of [-CAMERA_LIMIT, 0, CAMERA_LIMIT]) for (const z of [-CAMERA_LIMIT, 0, CAMERA_LIMIT]) {
    c.center = [x, z];
    const bounds = c.bounds();
    assert.ok(bounds.maxX - bounds.minX <= 30);
    assert.ok(bounds.maxZ - bounds.minZ <= 30);
    assert.ok(Object.values(bounds).every(value => Number.isInteger(value) && Math.abs(value) <= CAMERA_LIMIT));
    assert.ok(bounds.minX <= x && bounds.maxX >= x);
    assert.ok(bounds.minZ <= z && bounds.maxZ >= z);
    c.yaw = Math.PI / 2;
    assert.deepEqual(c.bounds(), bounds);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, labelStep, MIN_ZOOM, MAX_ZOOM } from '../src/camera.js';
import { BoardGesture } from '../src/gestures.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);
const setup = () => { const camera = new Camera(); camera.resize(390, 844); const taps = []; return { camera, taps, gesture: new BoardGesture(camera, { change() {}, tap: (...p) => taps.push(p) }) }; };

for (const [width, height] of [[320, 568], [375, 667], [390, 844], [414, 896], [768, 1024], [1920, 1080], [844, 390]]) {
  test(`camera coordinate conversion and anchored zoom at ${width}×${height}`, () => {
    const c = new Camera(); c.resize(width, height, { top: 20, bottom: 20 });
    for (const point of [[0, 0], [-3, 6], [1337, -444]]) {
      const screen = c.screen(...point), world = c.world(...screen);
      point.forEach((value, index) => near(value, world[index]));
      assert.deepEqual(c.hit(...screen), point);
    }
    const anchor = [width * .61, height * .4], original = c.world(...anchor);
    c.zoomAt(2, ...anchor);
    original.forEach((value, index) => near(value, c.world(...anchor)[index]));
    c.zoomAt(1e6, ...anchor); assert.equal(c.zoom, MAX_ZOOM);
    c.zoomAt(1e-6, ...anchor); assert.equal(c.zoom, MIN_ZOOM);
    original.forEach((value, index) => near(value, c.world(...anchor)[index]));
    c.pan(100000, 100000); assert.equal(c.originVisible, false);
    c.home(); assert.equal(c.originVisible, true); assert.equal(c.zoom, 1);
  });
}

test('LOD picks 1/2/5 intervals anchored to zero', () => {
  assert.deepEqual([.2, 1, 1.1, 2, 2.1, 5.1, 10.1, 50.1].map(labelStep), [1, 1, 2, 2, 5, 10, 20, 100]);
});
test('a short touch is exactly one tap; a drag never places a piece', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.screen(0, -1);
  gesture.down(1, x, y, 'touch'); gesture.move(1, x + 2, y + 3); gesture.up(1, x + 2, y + 3);
  assert.deepEqual(taps, [[0, -1]]);
  gesture.down(2, x, y, 'touch'); gesture.move(2, x + 30, y); gesture.move(2, x, y); gesture.up(2, x, y);
  assert.equal(taps.length, 1);
});
test('release outside threshold without move event is not a tap', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  gesture.down(1, x, y); gesture.up(1, x + 30, y);
  assert.equal(taps.length, 0);
});
test('two-finger pinch and the remaining finger cannot place pieces', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  gesture.down(1, x - 50, y, 'touch'); gesture.down(2, x + 50, y, 'touch');
  gesture.move(2, x + 100, y); near(camera.zoom, 1.5);
  gesture.up(2, x + 100, y); gesture.move(1, x - 30, y); gesture.up(1, x - 30, y);
  assert.equal(taps.length, 0);
  gesture.down(3, x, y, 'touch'); gesture.up(3, x, y); assert.equal(taps.length, 1);
});
test('pinch translates the original world anchor with the new midpoint', () => {
  const { camera, gesture } = setup(), [x, y] = camera.midpoint, original = camera.world(x, y);
  gesture.down(1, x - 50, y, 'touch'); gesture.down(2, x + 50, y, 'touch');
  gesture.move(1, x - 80, y + 15); gesture.move(2, x + 100, y + 15);
  original.forEach((value, index) => near(value, camera.world(x + 10, y + 15)[index]));
});
test('pointer cancellation, lost focus, and gutter taps never edit', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  gesture.down(1, x, y); gesture.up(1, x, y, true);
  gesture.down(2, x, y); gesture.cancel(); gesture.up(2, x, y);
  gesture.down(3, 2, 2); gesture.up(3, 2, 2);
  assert.equal(taps.length, 0);
});

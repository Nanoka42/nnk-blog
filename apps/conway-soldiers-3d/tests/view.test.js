import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, CAMERA_LIMIT, MIN_ZOOM, MAX_ZOOM, MIN_PLANE_SCALE } from '../src/camera.js';
import { BoardGesture } from '../src/gestures.js';
import { Renderer, neighborStyle, TARGET_COLORS } from '../src/renderer.js';
import { Board } from '../src/engine.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);
const setup = () => {
  const camera = new Camera(); camera.resize(600, 700);
  const taps = [], changes = [], drags = [];
  const gesture = new BoardGesture(camera, { change: () => changes.push(true), tap: (...p) => taps.push(p), drag: value => drags.push(value) });
  return { camera, taps, changes, drags, gesture };
};

for (const [width, height] of [[320, 450], [390, 600], [800, 650], [1440, 900]]) {
  test(`active-plane screen / world / hit roundtrip at ${width} × ${height}`, () => {
    const c = new Camera(); c.resize(width, height); c.center = [17.2, -8.3]; c.slice = -13;
    for (const yaw of [0, .7, -.9, Math.PI, -2.3]) {
      c.yaw = yaw;
      for (const point of [[17, -13, -8], [15, -13, -5], [19, -13, -9]]) {
        const screen = c.screen(...point), world = c.world(...screen.slice(0, 2));
        point.forEach((v, i) => near(world[i], v));
        assert.deepEqual(c.hit(...screen), point);
      }
    }
  });
}

test('phone defaults keep larger tap spacing and every visible site picks exactly', () => {
  for (const [width, height] of [[320, 343], [355, 343], [390, 450], [430, 600]]) {
    const c = new Camera(); c.resize(width, height);
    assert.ok(c.cell >= 30 && c.cell <= 36);
    assert.equal(c.originVisible, true);
    assert.equal(c.inside(...c.screen(2, c.slice, 7)), true);
    const b = c.bounds(); let visible = 0;
    for (let x = b.minX; x <= b.maxX; x++) for (let z = b.minZ; z <= b.maxZ; z++) {
      const point = [x, c.slice, z], screen = c.screen(...point);
      if (!c.inside(...screen)) continue;
      assert.deepEqual(c.hit(...screen), point);
      visible++;
    }
    assert.ok(visible >= 40);
  }
});

test('anchored zoom and drag preserve the same projected world point', () => {
  const { camera: c } = setup(); c.slice = 32;
  const anchor = [271, 238], original = c.world(...anchor);
  c.zoomAt(1.7, ...anchor); original.forEach((v, i) => near(c.world(...anchor)[i], v));
  c.pan(41, -23); original.forEach((v, i) => near(c.world(anchor[0] + 41, anchor[1] - 23)[i], v));
  c.zoomAt(1e6, ...anchor); assert.equal(c.zoom, MAX_ZOOM);
  c.zoomAt(1e-9, ...anchor); assert.equal(c.zoom, MIN_ZOOM);
  const before = c.zoom; c.zoomAt(NaN, ...anchor); c.zoomAt(-1, ...anchor); assert.equal(c.zoom, before);
});

test('blank space outside the capped visible window cannot edit invisible sites', () => {
  const c = new Camera(); c.resize(1800, 650); c.zoom = MIN_ZOOM; c.face();
  const visible = c.screen(5, c.slice, 0), hidden = c.screen(30, c.slice, 0);
  assert.equal(c.inside(...hidden), true);
  assert.deepEqual(c.hit(...visible), [5, 0, 0]);
  assert.equal(c.hit(...hidden), null);
  const far = [1337, c.slice, -444], world = c.world(...c.screen(...far).slice(0, 2));
  far.forEach((v, i) => near(v, world[i]));
});

test('slice switching retains the work-plane projection and changes only hit Y', () => {
  const { camera: c } = setup(); const p = c.screen(2, 0, -1);
  c.slice = 10;
  const newP = c.screen(2, 10, -1); p.forEach((v, i) => near(v, newP[i]));
  assert.deepEqual(c.hit(...p), [2, 10, -1]);
  c.depth = 100; assert.equal(c.depth, 2); c.depth = -3; assert.equal(c.depth, 0);
});

test('edge-on planes cannot be picked; home and face recover an editable view', () => {
  const { camera: c } = setup(); c.yaw = Math.PI / 2;
  assert.equal(c.pickable, false); assert.equal(c.hit(300, 350), null);
  c.pan(20, -40); c.zoomAt(2, 300, 350); assert.ok(c.center.every(Number.isFinite));
  c.face(); assert.equal(c.pickable, true); assert.equal(c.yaw, 0); assert.equal(c.pitch, 0);
  c.home(); assert.equal(c.slice, 0); assert.equal(c.zoom, 1); assert.equal(c.originVisible, true);
});

test('foreshortened, overlapping plane silhouettes are protected before edge-on', () => {
  const { camera: c } = setup(); c.pitch = 0; c.yaw = 1.3;
  assert.equal(c.pickable, false); assert.equal(c.hit(...c.screen(0, 0, 0)), null);
  c.yaw = .8; assert.equal(c.pickable, true);
});

test('finite sampling window and safe camera limits at any orbit or zoom', () => {
  const { camera: c } = setup();
  c.slice = 1e20; assert.equal(c.slice, CAMERA_LIMIT);
  c.center = [Infinity, -1e20]; assert.deepEqual(c.center, [0, -CAMERA_LIMIT]);
  for (const yaw of [0, .4, 1.2, Math.PI / 2, Math.PI]) for (const zoom of [.001, 1, 100]) {
    c.yaw = yaw; c.zoom = zoom;
    const b = c.bounds();
    assert.ok(b.maxX - b.minX <= 30); assert.ok(b.maxZ - b.minZ <= 30);
    assert.ok(Object.values(b).every(n => Number.isFinite(n) && Math.abs(n) <= CAMERA_LIMIT));
  }
  for (let i = 0; i < 100; i++) c.orbit(200, 200);
  assert.ok(c.pitch <= Math.PI / 2); assert.ok(Math.abs(c.yaw) <= Math.PI);
});

test('mouse and touch taps resolve once, while drag or out-of-bounds taps never edit', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.screen(0, 0, -1);
  gesture.down(1, x, y, 'touch'); gesture.move(1, x + 2, y + 2); gesture.up(1, x + 2, y + 2);
  assert.deepEqual(taps, [[0, 0, -1]]);
  const yaw = camera.yaw;
  gesture.down(2, x, y); gesture.move(2, x + 40, y); gesture.up(2, x + 40, y);
  assert.notEqual(camera.yaw, yaw); assert.equal(taps.length, 1);
  gesture.down(3, x, y); gesture.up(3, x + 40, y);
  gesture.down(4, 1, 1); gesture.up(4, 1, 1); assert.equal(taps.length, 1);
});

test('right-button orbit and middle/shift pan never become board taps', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  gesture.down(1, x, y, 'mouse', 2); gesture.up(1, x, y); assert.equal(taps.length, 0);
  let center = [...camera.center], yaw = camera.yaw;
  gesture.down(2, x, y, 'mouse', 2); gesture.move(2, x + 40, y); gesture.up(2, x + 40, y);
  assert.notEqual(camera.yaw, yaw); assert.deepEqual(camera.center, center);
  yaw = camera.yaw;
  gesture.down(3, x, y, 'mouse', 1); gesture.move(3, x + 40, y); gesture.up(3, x + 40, y);
  assert.equal(camera.yaw, yaw); assert.notDeepEqual(camera.center, center); assert.equal(taps.length, 0);
  center = [...camera.center];
  gesture.down(4, x, y, 'mouse', 0, true); gesture.move(4, x, y + 30); gesture.up(4, x, y + 30);
  assert.notDeepEqual(camera.center, center); assert.equal(camera.yaw, yaw);
});

test('pan mode applies to a single finger without changing orbit', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  gesture.mode = () => 'pan'; const yaw = camera.yaw, center = [...camera.center];
  gesture.down(1, x, y, 'touch'); gesture.move(1, x + 40, y); gesture.up(1, x + 40, y);
  assert.equal(camera.yaw, yaw); assert.notDeepEqual(camera.center, center); assert.equal(taps.length, 0);
});

for (const plane of ['XZ', 'XY']) test(`${plane} pinch anchors pan and zoom without orbiting or dropping an accidental piece`, () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  camera.setPlane(plane); camera.home();
  const anchor = camera.world(x, y), yaw = camera.yaw, pitch = camera.pitch;
  gesture.down(1, x - 50, y, 'touch'); gesture.down(2, x + 50, y, 'touch');
  gesture.move(1, x - 80, y + 15); gesture.move(2, x + 100, y + 15);
  anchor.forEach((value, i) => near(value, camera.world(x + 10, y + 15)[i]));
  const projected = camera.screen(...anchor);
  near(projected[0], x + 10); near(projected[1], y + 15);
  assert.equal(camera.yaw, yaw); assert.equal(camera.pitch, pitch); assert.ok(camera.zoom > 1);
  gesture.up(2, x + 100, y + 15); gesture.move(1, x - 60, y + 28); gesture.up(1, x - 60, y + 28);
  assert.equal(taps.length, 0); assert.equal(camera.yaw, yaw); assert.equal(camera.pitch, pitch);
  assert.equal(gesture.pointers.size, 0);
  const point = camera.point(0, 0), screen = camera.screen(...point);
  gesture.down(3, screen[0], screen[1], 'touch'); gesture.up(3, screen[0], screen[1]);
  assert.deepEqual(taps, [point]);
});

test('pointer cancellation and edge-on clicks never edit', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  gesture.down(1, x, y); gesture.up(1, x, y, true);
  gesture.down(2, x, y); gesture.cancel(); gesture.up(2, x, y);
  camera.yaw = Math.PI / 2;
  gesture.down(3, x, y); gesture.up(3, x, y); assert.equal(taps.length, 0); assert.equal(gesture.pointers.size, 0);
});

const pickerSetup = (pieces = [], selected = null) => {
  const { camera } = setup(), board = new Board();
  for (const point of pieces) board.toggle(...point);
  const renderer = new Renderer({ style: {}, getContext: () => ({}) }, camera, { board, selected, mode: selected ? 'play' : 'blueprint' });
  return { camera, board, renderer };
};

test('clicking a hollow neighbour never edits the current-plane cell under it', () => {
  const { camera: c, renderer } = pickerSetup([[0, 1, 0]]);
  const ghost = c.screen(0, 1, 0);
  assert.deepEqual(c.hit(...ghost), [0, 0, 0]);
  assert.equal(renderer.pick(...ghost), null);
  const taps = [], gesture = new BoardGesture(c, { pick: (x, y) => renderer.pick(x, y), tap: (...p) => taps.push(p) });
  gesture.down(1, ghost[0], ghost[1], 'touch'); gesture.up(1, ghost[0], ghost[1]);
  assert.equal(taps.length, 0);
  c.depth = 0;
  assert.deepEqual(renderer.pick(...ghost), [0, 0, 0]);
});

test('active sphere silhouettes and explicit grid dots win over overlapping ghosts', () => {
  const { camera: c, renderer, board } = pickerSetup([[0, 0, 0], [0, 1, 0]]);
  c.yaw = .24; c.pitch = 0;
  const p = c.screen(0, 0, 0), pointer = [p[0] - c.cell * .15, p[1]], ghost = c.screen(0, 1, 0);
  assert.ok(Math.hypot(pointer[0] - ghost[0], pointer[1] - ghost[1]) < c.cell * .145);
  assert.deepEqual(renderer.pick(...pointer), [0, 0, 0]);
  board.toggle(0, 0, 0);
  assert.equal(renderer.pick(...pointer), null);
  c.yaw = .08;
  assert.deepEqual(renderer.pick(...c.screen(0, 0, 0)), [0, 0, 0]);
});

test('same-plane legal target remains clickable through a hollow neighbouring piece', () => {
  const { camera: c, renderer } = pickerSetup([[0, 0, -2], [0, 0, -1], [0, 1, 0]], [0, 0, -2]);
  c.yaw = .24; c.pitch = 0;
  const p = c.screen(0, 0, 0), pointer = [p[0] - c.cell * .2, p[1]];
  assert.deepEqual(renderer.pick(...pointer), [0, 0, 0]);
  renderer.game.selected = null;
  assert.equal(renderer.pick(...pointer), null);
});

test('cross-Y destination circles jump directly instead of operating underlying active cells', () => {
  const { camera: c, renderer } = pickerSetup([[0, 0, 0], [0, 1, 0]], [0, 0, 0]);
  const target = c.screen(0, 2, 0);
  assert.notEqual(c.hit(...target), null);
  assert.deepEqual(renderer.pick(...target), [0, 2, 0]);
  renderer.game.selected = null;
  assert.deepEqual(renderer.pick(...target), c.hit(...target));
});

const sixWayPicker = () => pickerSetup([
  [0, 0, -2], [0, 0, -1], [0, 0, -3],
  [1, 0, -2], [-1, 0, -2], [0, 1, -2], [0, -1, -2],
], [0, 0, -2]);

test('newly editable shallow views keep sphere silhouettes and mouse/touch picks unambiguous', () => {
  for (const plane of ['XZ', 'XY']) for (const sign of [-1, 1]) for (const scale of [MIN_PLANE_SCALE + 1e-6, .47]) {
    const { camera: c, renderer, board } = pickerSetup([[0, 0, 0]]);
    c.setPlane(plane); c.slice = 0; c.center = [0, 0]; c.depth = 0;
    for (const direction of [-1, 1]) board.toggle(...c.point(plane === 'XZ' ? direction : 0, plane === 'XY' ? direction : 0));
    c.pitch = plane === 'XY' ? Math.asin(sign * scale) : 0;
    c.yaw = plane === 'XY' ? 0 : Math.acos(sign * scale);
    for (const [width, height] of [[320, 450], [1800, 900]]) for (const zoom of [MIN_ZOOM, 1, MAX_ZOOM]) {
      c.resize(width, height); c.zoom = zoom;
      const point = c.point(0, 0), p = c.screen(...point), radius = Math.min(c.cell * .224, 21);
      // Probe around the whole visible sphere, especially its compressed axis.
      // Its filled silhouette must still round to its own site near the guard.
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const pointer = [p[0] + Math.cos(angle) * radius, p[1] + Math.sin(angle) * radius];
        assert.deepEqual(renderer.pick(...pointer), point);
        const taps = [], gesture = new BoardGesture(c, { pick: (x, y) => renderer.pick(x, y), tap: (...p) => taps.push(p) });
        for (const type of ['mouse', 'touch']) {
          gesture.down(1, ...pointer, type); gesture.up(1, ...pointer);
        }
        assert.deepEqual(taps, [point, point]);
      }
    }
  }
});

test('newly editable shallow views still suppress neighboring ghost hits', () => {
  for (const plane of ['XZ', 'XY']) for (const sign of [-1, 1]) for (const offset of [-2, -1, 1, 2]) {
    const { camera: c, renderer, board } = pickerSetup();
    c.setPlane(plane); c.slice = 0; c.center = [0, 0]; c.depth = 2;
    c.pitch = plane === 'XY' ? Math.asin(sign * .47) : .2;
    c.yaw = plane === 'XY' ? .43 : Math.acos(sign * .47 / Math.cos(c.pitch));
    const point = c.point(0, 0, offset); board.toggle(...point);
    const ghost = c.screen(...point), candidate = c.hit(...ghost);
    assert.equal(c.pickable, true); assert.notEqual(candidate, null);
    assert.equal(renderer.pick(...ghost), null);
    c.depth = 0;
    assert.deepEqual(renderer.pick(...ghost), candidate);
  }
});

test('newly editable shallow views preserve six-axis destination picking from both sides', () => {
  for (const plane of ['XZ', 'XY']) for (const sign of [-1, 1]) {
    const { camera: c, renderer } = sixWayPicker();
    c.setPlane(plane, renderer.game.selected); c.center = plane === 'XY' ? [0, 0] : [0, -2]; c.depth = 2;
    c.pitch = plane === 'XY' ? Math.asin(sign * .47) : 0;
    c.yaw = plane === 'XY' ? 0 : Math.acos(sign * .47);
    assert.equal(c.pickable, true);
    const targets = renderer.targets();
    assert.equal(targets.length, 6);
    for (const target of targets) {
      assert.equal(target.occluded, false);
      assert.deepEqual(renderer.pick(...target.p), target.point);
    }
  }
});

test('all six separated legal destination circles are directly clickable, with no ghost layers', () => {
  const { camera: c, renderer } = sixWayPicker(); c.depth = 0;
  const targets = renderer.targets();
  assert.deepEqual(new Set(targets.map(t => t.label)), new Set(['+X', '−X', '+Y', '−Y', '+Z', '−Z']));
  assert.equal(targets.length, 6);
  for (const target of targets) {
    assert.equal(target.occluded, false);
    assert.equal(target.color, TARGET_COLORS[target.label.at(-1)]);
    assert.deepEqual(renderer.pick(...target.p), target.point);
  }
  const taps = [], gesture = new BoardGesture(c, { pick: (x, y) => renderer.pick(x, y), tap: (...p) => taps.push(p) });
  const target = targets.find(t => t.label === '+Y');
  gesture.down(1, ...target.p.slice(0, 2), 'touch'); gesture.up(1, ...target.p.slice(0, 2));
  assert.deepEqual(taps, [target.point]);
});

test('side-view edit guard still permits explicit six-direction jump circles', () => {
  const { camera: c, renderer } = sixWayPicker(); c.yaw = Math.PI / 2;
  assert.equal(c.pickable, false);
  for (const target of renderer.targets()) {
    assert.equal(target.occluded, false);
    assert.equal(c.hit(...target.p), null);
    assert.deepEqual(renderer.pick(...target.p), target.point);
  }
});

test('depth order disables the covered destination and nearest circle owns overlapping pixels', () => {
  const { camera: c, renderer } = pickerSetup([[0, 0, 0], [0, 1, 0], [0, -1, 0]], [0, 0, 0]);
  c.pitch = 0; c.yaw = .095;
  const targets = renderer.targets(), far = targets[0], near = targets[1];
  assert.ok(far.p[2] < near.p[2]);
  assert.equal(far.label, '−Y'); assert.equal(far.occluded, true);
  assert.equal(near.label, '+Y'); assert.equal(near.occluded, false);
  assert.notEqual(c.hit(...far.p), null);
  // The gray center is outside the foreground circle and above a selectable
  // active-plane piece: consuming this hit prevents an unintended deselection.
  assert.ok(Math.hypot(far.p[0] - near.p[0], far.p[1] - near.p[1]) > near.radius + 1);
  assert.equal(renderer.pick(...far.p), null);
  assert.deepEqual(renderer.pick((far.p[0] + near.p[0]) / 2, (far.p[1] + near.p[1]) / 2), near.point);
  assert.deepEqual(renderer.pick(...near.p), near.point);
});

test('covered destinations stay disabled through partial reveal, then re-enable when fully exposed', () => {
  const { camera: c, renderer } = pickerSetup([[0, 0, 0], [0, 1, 0], [0, -1, 0]], [0, 0, 0]);
  c.pitch = 0; c.yaw = 0;
  assert.equal(renderer.targets().find(t => t.label === '−Y').occluded, true);
  c.yaw = .12; // Less than 15% overlap, but the far ring has not fully emerged.
  assert.equal(renderer.targets().find(t => t.label === '−Y').occluded, true);
  c.yaw = .15;
  for (const target of renderer.targets()) {
    assert.equal(target.occluded, false);
    assert.deepEqual(renderer.pick(...target.p), target.point);
  }
  c.yaw = Math.PI; // The opposite world-Y destination is now in front.
  const reversed = renderer.targets();
  assert.equal(reversed.find(t => t.label === '+Y').occluded, true);
  assert.equal(reversed.find(t => t.label === '−Y').occluded, false);
  assert.deepEqual(renderer.pick(...reversed[1].p), [0, -2, 0]);
});

test('a different selection resets target occlusion hysteresis', () => {
  const { camera: c, renderer } = pickerSetup([[0, 0, 0], [0, 1, 0], [0, -1, 0]], [0, 0, 0]);
  c.pitch = 0; c.yaw = 0; renderer.targets();
  c.yaw = .12;
  assert.equal(renderer.targets()[0].occluded, true);
  renderer.game.selected = null; assert.deepEqual(renderer.targets(), []);
  renderer.game.selected = [0, 0, 0];
  // A small new overlap is below the entry threshold.
  assert.equal(renderer.targets()[0].occluded, false);
});

test('equal-depth coincident targets have a deterministic top target and no ambiguous hit', () => {
  const { camera: c, renderer } = pickerSetup([[0, 0, 0], [0, 1, 0], [0, -1, 0]], [0, 0, 0]);
  c.screen = () => [300, 350, 0];
  const targets = renderer.targets();
  assert.deepEqual(targets.map(t => [t.label, t.occluded]), [['+Y', true], ['−Y', false]]);
  assert.deepEqual(renderer.pick(300, 350), [0, -2, 0]);
  assert.deepEqual(renderer.targets().map(t => [t.label, t.occluded]), [['+Y', true], ['−Y', false]]);
});

test('both planes use signed-normal color and camera-depth outline for occupied and empty neighbors', () => {
  const { camera: c, renderer } = pickerSetup();
  assert.notEqual(neighborStyle(-1).color, neighborStyle(1).color);
  assert.deepEqual(neighborStyle(1).dash, []);
  assert.ok(neighborStyle(-1).dash.length > 0);
  assert.ok(neighborStyle(2).opacity < neighborStyle(1).opacity);
  assert.ok(neighborStyle(-2).opacity < neighborStyle(-1).opacity);
  const strokes = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, arc() {}, fill() {},
    setLineDash(dash) { this.dash = dash; },
    stroke() { strokes.push({ color: this.strokeStyle, dash: [...this.dash] }); } };
  renderer.ctx = ctx;
  for (const plane of ['XZ', 'XY']) for (const yaw of [.43, Math.PI]) for (const pitch of [-1.1, .7]) {
    c.setPlane(plane); c.yaw = yaw; c.pitch = pitch;
    for (const occupied of [false, true]) for (const sign of [-1, 1]) {
      const point = c.point(0, 0, c.slice + sign);
      renderer.node({ point, p: c.screen(...point), active: false, occupied });
      const stroke = strokes.at(-1);
      assert.equal(stroke.color, neighborStyle(sign, c).color);
      assert.equal(stroke.dash.length > 0, neighborStyle(sign, c).far);
      const depth = c.screen(...point)[2] - c.screen(...c.point(0, 0))[2];
      assert.equal(neighborStyle(sign, c).far, depth < -1e-7);
    }
  }
});

test('neighbor outline swaps on a rear view while world-Y color stays fixed and depth ties remain solid', () => {
  const { camera: c } = setup();
  for (const offset of [-2, -1, 1, 2]) {
    c.yaw = .43; const front = neighborStyle(offset, c);
    c.yaw = Math.PI; const back = neighborStyle(offset, c);
    assert.equal(front.color, back.color);
    assert.notEqual(front.far, back.far);
    assert.equal(front.far, offset < 0);
    assert.equal(back.far, offset > 0);
    assert.equal(front.dash.length > 0, front.far);
    assert.equal(back.dash.length > 0, back.far);
    for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
      c.yaw = yaw;
      assert.equal(neighborStyle(offset, c).far, false);
      assert.deepEqual(neighborStyle(offset, c).dash, []);
    }
  }
});

test('selection rendering includes all six world-axis labels and gray dashed covered circles', () => {
  const { camera: c, renderer } = sixWayPicker(); c.face();
  const labels = [], strokes = [];
  const ctx = { beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {},
    setLineDash(dash) { this.dash = dash; },
    fillText(label) { labels.push(label); },
    stroke() { strokes.push({ color: this.strokeStyle, dash: [...this.dash] }); } };
  renderer.ctx = ctx; renderer.selection();
  assert.deepEqual(new Set(labels), new Set(['+X', '−X', '+Y', '−Y', '+Z', '−Z']));
  assert.ok(strokes.some(stroke => stroke.color === '#83909b' && stroke.dash.length > 0));
  for (const color of Object.values(TARGET_COLORS)) {
    assert.ok(strokes.some(stroke => stroke.color === color && stroke.dash.length === 0));
  }
});

test('ghost suppression follows displayed depth and retains generous empty-cell taps', () => {
  const { camera: c, renderer } = pickerSetup([[1, 2, 0]]);
  const ghost = c.screen(1, 2, 0), candidate = c.hit(...ghost);
  assert.notEqual(candidate, null);
  assert.deepEqual(renderer.pick(...ghost), candidate);
  c.depth = 2;
  assert.equal(renderer.pick(...ghost), null);
  const empty = c.screen(3, 0, 0), pointer = [empty[0] + c.cell * .3, empty[1]];
  assert.deepEqual(renderer.pick(...pointer), [3, 0, 0]);
  assert.equal(renderer.pick(1, 1), null);
  c.yaw = Math.PI / 2;
  assert.equal(renderer.pick(...c.midpoint), null);
});

const drawingContext = () => {
  const gradient = { addColorStop() {} };
  return new Proxy({ measureText: text => ({ width: text.length * 6 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, {
    get(target, prop) { return target[prop] ?? (() => {}); },
  });
};

for (const plane of ['XZ', 'XY']) test(`${plane} rendering visits at most 31 × 31 × 5 sites per frame`, () => {
  const c = new Camera(); c.resize(1400, 1000); c.zoom = MIN_ZOOM; c.depth = 2;
  c.setPlane(plane); c.home(); c.zoom = MIN_ZOOM;
  let occupancyQueries = 0;
  const board = { has(x, y, z) { occupancyQueries++; return z <= 0; }, movesFrom() { return []; } };
  const ctx = drawingContext();
  const canvas = { style: {}, getContext: () => ctx };
  const renderer = new Renderer(canvas, c, { board, selected: null, mode: 'blueprint' });
  renderer.render();
  assert.ok(occupancyQueries > 0); assert.ok(occupancyQueries <= 31 * 31 * 5);
  assert.equal(canvas.style.width, '100%');
});

test('XY neighbor silhouettes never edit their projected current-plane cells, from either side', () => {
  for (const pitch of [-1.2, -.85, .85, 1.2]) for (const yaw of [0, .43, Math.PI]) for (const offset of [-2, -1, 1, 2]) {
    const { camera: c, renderer } = pickerSetup([[0, 0, offset]]);
    c.setPlane('XY'); c.slice = 0; c.center = [0, 0]; c.pitch = pitch; c.yaw = yaw; c.depth = 2;
    const ghost = c.screen(0, 0, offset), candidate = c.hit(...ghost);
    assert.notEqual(candidate, null);
    assert.equal(renderer.pick(...ghost), null, `pitch ${pitch}, yaw ${yaw}, offset ${offset}`);
    c.depth = 0;
    assert.deepEqual(renderer.pick(...ghost), candidate);
  }
});

test('XY active pieces and exact grid dots retain priority over neighboring Z silhouettes', () => {
  const { camera: c, renderer, board } = pickerSetup([[0, 0, 0], [0, 0, -1]]);
  c.setPlane('XY'); c.slice = 0; c.center = [0, 0]; c.yaw = 0; c.pitch = -Math.PI / 2 + .24;
  const p = c.screen(0, 0, 0), pointer = [p[0], p[1] + c.cell * .15], ghost = c.screen(0, 0, -1);
  assert.ok(Math.hypot(pointer[0] - ghost[0], pointer[1] - ghost[1]) < c.cell * .145);
  assert.deepEqual(renderer.pick(...pointer), [0, 0, 0]);
  board.toggle(0, 0, 0);
  assert.equal(renderer.pick(...pointer), null);
  c.pitch = -Math.PI / 2 + .08;
  assert.deepEqual(renderer.pick(...c.screen(0, 0, 0)), [0, 0, 0]);
});

test('XY six-axis handles stay world-colored and clickable in oblique and guarded side views', () => {
  const { camera: c, renderer } = sixWayPicker();
  c.setPlane('XY'); c.slice = -2; c.center = [0, 0]; c.depth = 0;
  for (const pitch of [-.9, 0]) {
    c.pitch = pitch;
    assert.equal(c.pickable, pitch !== 0);
    const targets = renderer.targets();
    assert.equal(targets.length, 6);
    for (const target of targets) {
      assert.equal(target.occluded, false);
      assert.equal(target.color, TARGET_COLORS[target.label.at(-1)]);
      assert.deepEqual(renderer.pick(...target.p), target.point);
    }
    const target = targets.find(t => t.label === '+Z'), taps = [];
    const gesture = new BoardGesture(c, { pick: (x, y) => renderer.pick(x, y), tap: (...p) => taps.push(p) });
    gesture.down(1, ...target.p.slice(0, 2), 'touch'); gesture.up(1, ...target.p.slice(0, 2));
    assert.deepEqual(taps, [target.point]);
  }
});

test('XY covered Z handles recover only after full reveal and swap ownership on the other side', () => {
  const { camera: c, renderer } = pickerSetup([[0, 0, 0], [0, 0, -1], [0, 0, 1]], [0, 0, 0]);
  c.setPlane('XY'); c.slice = 0; c.center = [0, 0]; c.face();
  assert.equal(renderer.targets().find(t => t.label === '+Z').occluded, true);
  c.pitch = -Math.PI / 2 + .12;
  assert.equal(renderer.targets().find(t => t.label === '+Z').occluded, true);
  c.pitch = -Math.PI / 2 + .15;
  for (const target of renderer.targets()) {
    assert.equal(target.occluded, false);
    assert.deepEqual(renderer.pick(...target.p), target.point);
  }
  c.pitch = Math.PI / 2;
  const reversed = renderer.targets();
  assert.equal(reversed.find(t => t.label === '−Z').occluded, true);
  assert.equal(reversed.find(t => t.label === '+Z').occluded, false);
  assert.deepEqual(renderer.pick(...reversed.at(-1).p), [0, 0, 2]);
});

test('changing work planes preserves handle projections, occlusion and world-axis labels', () => {
  const { camera: c, renderer } = sixWayPicker(); c.pitch = -.75;
  const before = renderer.targets();
  c.setPlane('XY', renderer.game.selected);
  assert.deepEqual(renderer.targets(), before);
  c.setPlane('XZ', renderer.game.selected);
  assert.deepEqual(renderer.targets(), before);
});

test('XY grid treats Z=0/7/8 as whole planes and uses Y coordinate labels', () => {
  const { camera: c, renderer } = pickerSetup();
  c.setPlane('XY'); c.center = [0, 0]; c.depth = 0; c.face();
  const texts = [], lines = [], polygons = [];
  renderer.ctx = { fillText: text => texts.push(text) };
  renderer.chip = text => texts.push(text);
  renderer.worldLine = (a, b, color, width, dash) => lines.push({ a, b, color, width, dash });
  renderer.polygon = (points, fill, stroke) => polygons.push({ points, fill, stroke });
  for (const [slice, description, stroke] of [[0, '起始边界', '#89d9bc65'], [7, '有限步可达', '#d3af6259'], [8, '不可到达', '#ad858a40']]) {
    c.slice = slice; texts.length = 0; lines.length = 0; polygons.length = 0;
    renderer.grid(c.bounds()); renderer.labels(c.bounds());
    assert.ok(texts.includes(`Z = ${slice} · ${description}`));
    assert.ok(texts.some(text => /^Y /.test(text)));
    assert.ok(texts.some(text => /^X /.test(text)));
    assert.ok(polygons.some(polygon => polygon.stroke === stroke));
    assert.ok(polygons.every(polygon => polygon.points.every(point => point[2] === slice)));
    assert.ok(lines.every(line => line.a[2] === slice && line.b[2] === slice));
    assert.ok(lines.every(line => !line.dash?.length));
    assert.ok(lines.every(line => !['#d3af6259', '#ad858a28'].includes(line.color)));
    const reference = lines.filter(line => line.color === '#89d9bc65');
    assert.equal(reference.length, 2);
    for (const axis of [0, 1]) {
      const rail = reference.find(line => line.a[axis] === 0 && line.b[axis] === 0);
      assert.ok(rail); assert.equal(rail.width, 1.5);
    }
  }
});

test('both planes emphasize the current X reference line over neighboring slice rails', () => {
  const { camera: c, renderer } = pickerSetup(), lines = [];
  renderer.polygon = () => {};
  renderer.worldLine = (a, b, color, width, dash) => lines.push({ a, b, color, width, dash });
  for (const plane of ['XZ', 'XY']) for (const depth of [1, 2]) {
    c.setPlane(plane); c.slice = 3; c.center = [0, 0]; c.yaw = .43; c.pitch = -.8; c.depth = depth;
    lines.length = 0; renderer.grid(c.bounds());
    const rails = lines.filter(line => line.a[c.verticalAxis] === 0 && line.b[c.verticalAxis] === 0 && line.a[0] !== line.b[0]);
    const current = rails.find(line => line.a[c.normalAxis] === c.slice);
    const neighbors = rails.filter(line => line.a[c.normalAxis] !== c.slice);
    assert.equal(neighbors.length, 2);
    assert.equal(current.color, '#89d9bc65'); assert.equal(current.width, 1.5); assert.deepEqual(current.dash, []);
    for (const neighbor of neighbors) {
      assert.ok(current.width > neighbor.width);
      assert.ok(parseInt(current.color.slice(-2), 16) > parseInt(neighbor.color.slice(-2), 16));
    }
  }
});

test('XY render samples normal-Z layers and only focuses hover/cursor on the current Z plane', () => {
  const { camera: c, renderer } = pickerSetup([[1, 2, 0], [1, 2, -1], [1, 2, 1]]);
  c.setPlane('XY'); c.slice = 0; c.center = [0, 0]; c.pitch = -1.1;
  renderer.ctx = drawingContext();
  const nodes = [], focused = [];
  renderer.node = node => nodes.push(node); renderer.focus = point => focused.push(point);
  renderer.hover = [1, 2, 0]; renderer.cursor = [1, 0, 1];
  renderer.render();
  assert.ok(nodes.filter(node => node.active).every(node => node.point[2] === 0));
  assert.ok(nodes.some(node => !node.active && node.occupied && node.point[2] === -1));
  assert.ok(nodes.some(node => !node.active && node.occupied && node.point[2] === 1));
  assert.deepEqual(focused, [[1, 2, 0]]);
  focused.length = 0; renderer.hover = [1, 0, 1]; renderer.cursor = [1, -3, 0];
  renderer.render();
  assert.deepEqual(focused, [[1, -3, 0]]);
});

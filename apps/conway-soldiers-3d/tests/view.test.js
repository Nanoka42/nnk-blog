import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, CAMERA_LIMIT, MIN_ZOOM, MAX_ZOOM } from '../src/camera.js';
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
        const screen = c.screen(...point), world = c.world(...screen);
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
  const far = [1337, c.slice, -444], world = c.world(...c.screen(...far));
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
  assert.ok(c.pitch <= .85); assert.ok(Math.abs(c.yaw) <= Math.PI);
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

test('pinch anchors pan and zoom without orbiting or dropping an accidental piece', () => {
  const { camera, taps, gesture } = setup(), [x, y] = camera.midpoint;
  const anchor = camera.world(x, y), yaw = camera.yaw;
  gesture.down(1, x - 50, y, 'touch'); gesture.down(2, x + 50, y, 'touch');
  gesture.move(1, x - 80, y + 15); gesture.move(2, x + 100, y + 15);
  anchor.forEach((value, i) => near(value, camera.world(x + 10, y + 15)[i]));
  assert.equal(camera.yaw, yaw); assert.ok(camera.zoom > 1);
  gesture.up(2, x + 100, y + 15); gesture.move(1, x - 60, y + 15); gesture.up(1, x - 60, y + 15);
  assert.equal(taps.length, 0); assert.equal(camera.yaw, yaw);
  gesture.down(3, x, y, 'touch'); gesture.up(3, x, y); assert.equal(taps.length, 1);
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

test('both occupied and empty neighbor references show world-Y color and camera-depth outline', () => {
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
  for (const yaw of [.43, Math.PI]) for (const occupied of [false, true]) for (const sign of [-1, 1]) {
    c.yaw = yaw;
    const point = [0, c.slice + sign, 0];
    renderer.node({ point, p: c.screen(...point), active: false, occupied });
    const stroke = strokes.at(-1);
    assert.equal(stroke.color, neighborStyle(sign, c).color);
    assert.equal(stroke.dash.length > 0, neighborStyle(sign, c).far);
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

test('rendering a full half-space visits at most 31 × 31 × 5 sites per frame', () => {
  const c = new Camera(); c.resize(1400, 1000); c.zoom = MIN_ZOOM; c.depth = 2;
  let occupancyQueries = 0;
  const board = { has(x, y, z) { occupancyQueries++; return z <= 0; }, movesFrom() { return []; } };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({ measureText: text => ({ width: text.length * 6 }), createLinearGradient: () => gradient, createRadialGradient: () => gradient }, {
    get(target, prop) { return target[prop] ?? (() => {}); },
  });
  const canvas = { style: {}, getContext: () => ctx };
  const renderer = new Renderer(canvas, c, { board, selected: null, mode: 'blueprint' });
  renderer.render();
  assert.ok(occupancyQueries > 0); assert.ok(occupancyQueries <= 31 * 31 * 5);
  assert.equal(canvas.style.width, '100%');
});

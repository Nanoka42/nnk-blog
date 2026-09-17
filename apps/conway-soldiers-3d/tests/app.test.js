import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Camera, CAMERA_LIMIT } from '../src/camera.js';

// These doubles exercise the actual app, renderer and gesture event handlers.
// They verify state and HTML wiring, not browser layout or real-device touch.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const originalSetTimeout = globalThis.setTimeout;
const timers = new Set();
globalThis.setTimeout = (callback, delay, ...args) => {
  const timer = originalSetTimeout(callback, delay, ...args);
  timer.unref?.(); timers.add(timer); return timer;
};
after(() => {
  for (const timer of timers) clearTimeout(timer);
  globalThis.setTimeout = originalSetTimeout;
});

const context = new Proxy({}, {
  get(target, property) {
    if (property in target) return target[property];
    if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (property === 'createPattern') return () => ({ setTransform() {} });
    if (property === 'measureText') return text => ({ width: String(text).length * 7 });
    return () => {};
  },
});

class Element {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase(); this.id = id;
    this.listeners = new Map(); this.attributes = new Map(); this.children = new Map(); this.childNodes = [];
    this.dataset = {}; this.style = { setProperty() {} }; this.classes = new Set();
    this.disabled = false; this.hidden = false; this.open = false; this.returnValue = '';
    this._value = ''; this._textContent = ''; this.innerHTML = '';
    this.clientWidth = 960; this.clientHeight = 700; this.captures = new Set();
    this.classList = {
      toggle: (name, force) => {
        const enabled = force ?? !this.classes.has(name);
        if (enabled) this.classes.add(name); else this.classes.delete(name);
        return enabled;
      },
      contains: name => this.classes.has(name),
    };
  }
  set value(value) { this._value = String(value); }
  get value() { return this._value; }
  set textContent(value) { this._textContent = String(value); this.childNodes = []; }
  get textContent() { return this.childNodes.length ? this.childNodes.map(child => child.textContent).join('') : this._textContent; }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || []; handlers.push(handler); this.listeners.set(type, handlers);
  }
  dispatch(type, supplied = {}) {
    const event = { target: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...supplied };
    for (const handler of this.listeners.get(type) || []) handler(event);
    return event;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  querySelector(selector) { return this.children.get(selector) ?? null; }
  replaceChildren(...children) { this.childNodes = children; this._textContent = ''; }
  append(...children) { this.childNodes.push(...children); }
  focus() { document.activeElement = this; }
  showModal() { this.open = true; }
  close(value) {
    if (value !== undefined) this.returnValue = value;
    this.open = false; this.dispatch('close');
  }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.dispatch('lostpointercapture', { pointerId: id }); }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight }; }
  getContext() { return context; }
}

let instance = 0;
async function setup() {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  const elements = new Map();
  for (const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const [, tagName, attributes, id] = match;
    assert.equal(elements.has(id), false, `duplicate HTML id: ${id}`);
    const element = new Element(tagName, id);
    for (const attr of attributes.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
      element.setAttribute(attr[1], attr[2] ?? '');
      if (attr[1] === 'value') element.value = attr[2];
      if (['hidden', 'disabled'].includes(attr[1])) element[attr[1]] = true;
    }
    elements.set(id, element);
  }
  for (const match of html.matchAll(/<button\b([^>]*\bid="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g)) {
    const element = elements.get(match[2]);
    const bold = /<b>([\s\S]*?)<\/b>/.exec(match[3]);
    if (bold) { const child = new Element('b'); child.textContent = bold[1]; element.children.set('b', child); }
    element.innerHTML = match[3]; element.textContent = match[3].replace(/<[^>]*>/g, '');
  }
  const frames = [], requests = [], registered = new Map(), registrations = [];
  let frameId = 0, pointerId = 0;
  const documentStub = new Element('document');
  documentStub.body = new Element('body');
  documentStub.getElementById = id => {
    assert.ok(elements.has(id), `app references missing HTML id: ${id}`);
    return elements.get(id);
  };
  documentStub.createElement = tag => new Element(tag);
  documentStub.createTextNode = text => ({ textContent: String(text) });
  documentStub.modelContext = { registerTool(tool, options) {
    assert.equal(registered.has(tool.name), false, `duplicate tool: ${tool.name}`);
    registered.set(tool.name, tool); registrations.push({ tool, options });
  } };
  globalThis.document = documentStub;
  globalThis.window = new Element('window'); window.devicePixelRatio = 2;
  globalThis.devicePixelRatio = 2;
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return ++frameId; };
  globalThis.fetch = async url => { requests.push(new URL(url)); throw new Error('Simulated unavailable audio'); };
  await import(`../src/app.js?app-test=${++instance}`);

  const $ = id => elements.get(id), canvas = $('board');
  const flush = () => {
    let count = 0;
    while (frames.length) { assert.ok(++count < 100, 'render should settle without an animation loop'); frames.shift()(0); }
  };
  const snapshot = () => registered.get('read_conway_game').execute();
  const currentCamera = () => {
    const camera = new Camera(); camera.resize(canvas.clientWidth, canvas.clientHeight);
    const { pickable, autoFollow, ...view } = snapshot().view;
    Object.assign(camera, view); return camera;
  };
  const screen = point => currentCamera().screen(...point);
  const dispatchPointer = (type, id, pixel, extras = {}) => {
    const event = { target: canvas, pointerId: id, clientX: pixel[0], clientY: pixel[1], pointerType: 'touch', button: 0, ...extras };
    if (type === 'pointerdown') document.dispatch(type, event);
    canvas.dispatch(type, event); flush();
  };
  const down = point => {
    const held = { id: ++pointerId, pixel: screen(point) };
    dispatchPointer('pointerdown', held.id, held.pixel); return held;
  };
  const up = held => dispatchPointer('pointerup', held.id, held.pixel);
  const tap = point => { const held = down(point); up(held); };
  const click = id => {
    const element = $(id); assert.ok(element, `unknown button ${id}`);
    if (element.disabled) return;
    document.dispatch('pointerdown', { target: element });
    element.focus(); element.dispatch('click');
    // Native <form method="dialog"> submission follows the button's click.
    if (id === 'confirm-accept' && $('confirm-dialog').open) $('confirm-dialog').close(element.value);
    flush();
  };
  const confirm = value => {
    assert.equal($('confirm-dialog').open, true, 'expected confirmation dialog');
    if (value === 'confirm') click('confirm-accept');
    else { $('confirm-dialog').close(value); flush(); }
  };
  const input = (id, value, event = 'change') => { $(id).value = value; $(id).dispatch(event); flush(); };
  const key = (key, modifiers = {}) => {
    document.dispatch('keydown', { target: canvas, key, ...modifiers });
    canvas.dispatch('keydown', { key, ...modifiers }); flush();
  };
  const locate = (x, y, z) => {
    $('locate-x').value = x; $('locate-y').value = y; $('locate-z').value = z;
    const event = $('locate-form').dispatch('submit'); flush();
    assert.equal(event.defaultPrevented, true);
  };
  const execute = async (name, input) => {
    const promise = registered.get(name).execute(input); flush(); return await promise;
  };
  flush();
  return { $, canvas, snapshot, tap, down, up, click, confirm, input, key, locate,
    flush, execute, screen, dispatchPointer, registered, registrations, requests };
}

test('actual HTML wiring, accessible jump labels, WebMCP schema and offline resource requests', async () => {
  const h = await setup();
  assert.deepEqual([...h.registered.keys()], ['read_conway_game', 'toggle_blueprint_cells', 'start_conway_game', 'move_conway_piece']);
  assert.equal(h.snapshot().mode, 'blueprint');
  assert.equal(h.snapshot().pieces, 0);
  assert.equal(h.snapshot().view.autoFollow, true);
  assert.equal(h.$('auto-follow').getAttribute('aria-pressed'), 'true');
  assert.equal(h.$('primary-action').disabled, true);
  assert.equal(h.$('peak').textContent, '0/ 7');
  for (const [id, direction] of Object.entries({
    'jump-zp': '0,0,2', 'jump-zm': '0,0,-2', 'jump-xm': '-2,0,0',
    'jump-xp': '2,0,0', 'jump-ym': '0,-2,0', 'jump-yp': '0,2,0',
  })) {
    assert.equal(h.$(id).disabled, true);
    assert.equal(h.$(id).dataset.direction, direction);
    assert.match(h.$(id).getAttribute('aria-label'), /此方向暂时不能跳跃/);
  }
  const pointSchema = h.registered.get('move_conway_piece').inputSchema.properties.from;
  assert.equal(pointSchema.minItems, 3); assert.equal(pointSchema.maxItems, 3);
  assert.equal(h.registered.get('read_conway_game').annotations.readOnlyHint, true);
  for (const { tool, options } of h.registrations) {
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(tool.annotations.untrustedContentHint, false);
  }
  assert.equal(h.requests.length, 4);
  for (const url of h.requests) {
    assert.equal(url.protocol, 'file:');
    assert.match(url.pathname, /\/sounds\/[\w_]+\.wav$/);
    assert.ok((await readFile(url)).length > 44, 'local WAV resource exists beyond its header');
  }
  // Navigation links may point to the blog; automatically loaded assets must stay local.
  for (const match of html.matchAll(/<(?:script|link|img|audio|source)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
    assert.match(match[1], /^\.\//, `nonlocal HTML resource: ${match[1]}`);
    await readFile(new URL(`../${match[1]}`, import.meta.url));
  }
  h.click('sound'); assert.equal(h.$('sound').getAttribute('aria-pressed'), 'false');
  h.click('sound'); assert.equal(h.$('sound').getAttribute('aria-pressed'), 'true');
  const signal = h.registrations[0].options.signal;
  window.dispatch('pagehide', { persisted: true }); assert.equal(signal.aborted, false);
  window.dispatch('pagehide', { persisted: false }); assert.equal(signal.aborted, true);
});

test('the game interface has no tutorial controls or decorative title / footer slogans', async () => {
  const h = await setup();
  for (const id of ['demo', 'demo-guide', 'demo-count', 'demo-text', 'demo-next']) assert.equal(h.$(id), undefined);
  assert.match(html, /<title>康威跳棋\s*3D<\/title>/);
  assert.doesNotMatch(html, /class="scene-heading"|class="app-footer"|THE SEVENTH LAYER|向第七层/);
});

test('blueprint → start → direction-button jump → undo → cancel / confirm restart', async () => {
  const h = await setup();
  h.tap([0, 0, 1]); assert.equal(h.snapshot().pieces, 0);
  assert.match(h.$('toast').textContent, /Z ≤ 0/);
  h.tap([0, 0, -1]); h.tap([0, 0, 0]);
  assert.equal(h.snapshot().pieces, 2);
  h.click('primary-action');
  assert.equal(h.snapshot().mode, 'play');
  assert.equal(h.$('tertiary-action').disabled, true);
  assert.equal(h.$('initial-pieces').textContent, ' / 2');
  h.tap([0, 0, -1]);
  assert.deepEqual(h.snapshot().selected, [0, 0, -1]);
  assert.equal(h.$('jump-zp').disabled, false);
  assert.equal(h.$('jump-yp').disabled, true);
  h.click('jump-zp');
  assert.deepEqual(h.snapshot().differences, ['0,0,1']);
  assert.equal(h.snapshot().steps, 1); assert.equal(h.snapshot().peak, 1);
  assert.equal(h.snapshot().selected, null);
  h.click('tertiary-action');
  assert.equal(h.snapshot().steps, 0); assert.equal(h.snapshot().pieces, 2); assert.equal(h.snapshot().peak, 0);
  h.tap([0, 0, -1]); h.click('jump-zp');
  const afterMove = h.snapshot();
  h.click('secondary-action');
  assert.match(h.$('confirm-title').textContent, /重玩/);
  h.confirm('cancel'); assert.deepEqual(h.snapshot(), afterMove);
  assert.equal(document.activeElement, h.$('secondary-action'));
  h.click('secondary-action'); h.confirm('confirm');
  assert.equal(h.snapshot().mode, 'play'); assert.equal(h.snapshot().steps, 0);
  assert.equal(h.snapshot().pieces, 2); assert.equal(h.snapshot().peak, 0);
  h.click('primary-action'); assert.equal(h.snapshot().mode, 'blueprint');
});

test('hidden-layer edits survive slice / depth changes; Y jump follows landing and undo follows source', async () => {
  const h = await setup();
  h.tap([0, 0, 0]);
  h.click('slice-next'); h.tap([0, 1, 0]);
  h.input('depth', '0');
  assert.equal(h.snapshot().view.depth, 0);
  assert.deepEqual(new Set(h.snapshot().differences), new Set(['0,0,0', '0,1,0']));
  h.input('slice-value', '-4'); h.tap([1, -4, -1]);
  h.input('slice-value', '0');
  h.click('primary-action'); h.tap([0, 0, 0]);
  assert.equal(h.$('jump-yp').disabled, false);
  assert.match(h.$('jump-yp').title, /自动跟随/);
  h.click('jump-yp');
  assert.equal(h.snapshot().view.slice, 2);
  assert.equal(h.snapshot().view.depth, 0);
  assert.equal(h.snapshot().selected, null);
  assert.deepEqual(new Set(h.snapshot().differences), new Set(['0,2,0', '1,-4,-1']));
  h.click('tertiary-action');
  assert.equal(h.snapshot().view.slice, 0);
  assert.equal(h.snapshot().steps, 0); assert.equal(h.snapshot().pieces, 3);
  h.tap([0, 0, 0]);
  h.click('slice-next');
  assert.equal(h.snapshot().selected, null);
  assert.equal(h.$('jump-yp').disabled, true);
  h.tap([0, 1, 0]);
  h.input('slice-range', '-1', 'input');
  assert.equal(h.snapshot().selected, null);
  assert.equal(h.snapshot().pieces, 3);
});

test('tapping a hollow neighbor marker cannot edit or select an unrelated point on the active plane', async () => {
  const h = await setup();
  await h.execute('toggle_blueprint_cells', { cells: [[0, 1, 0]] });
  h.tap([0, 1, 0]);
  assert.deepEqual(h.snapshot().differences, ['0,1,0']);
  h.tap([0, 0, 0]);
  assert.equal(h.snapshot().pieces, 2);
  h.click('primary-action');
  h.tap([0, 1, 0]);
  assert.equal(h.snapshot().selected, null);
  h.tap([0, 0, 0]);
  assert.deepEqual(h.snapshot().selected, [0, 0, 0]);
  assert.equal(h.$('jump-yp').disabled, false);
  h.click('jump-yp');
  assert.equal(h.snapshot().view.slice, 2);
  assert.deepEqual(h.snapshot().differences, ['0,2,0']);
});

test('infinite fill / clear confirmations preserve holes across all slices and restart restores baseline', async () => {
  const h = await setup();
  h.tap([0, 0, 0]);
  h.click('tertiary-action'); h.confirm('cancel');
  assert.equal(h.snapshot().full, false); assert.equal(h.snapshot().pieces, 1);
  h.click('tertiary-action'); h.confirm('confirm');
  assert.equal(h.snapshot().full, true); assert.equal(h.snapshot().pieces, 'infinite');
  assert.equal(h.snapshot().holes, 0); assert.equal(h.$('pieces').textContent, '∞');
  assert.equal(h.$('tertiary-action').disabled, true);
  h.input('slice-value', '3'); h.tap([2, 3, -2]);
  h.input('slice-value', '0');
  assert.equal(h.snapshot().holes, 1);
  h.click('secondary-action'); h.confirm('cancel');
  assert.equal(h.snapshot().holes, 1);
  h.click('primary-action'); h.tap([0, 0, -1]); h.click('jump-zp');
  assert.equal(h.snapshot().holes, 3); assert.equal(h.snapshot().advanced, 1);
  assert.equal(h.snapshot().steps, 1);
  h.click('secondary-action'); h.confirm('confirm');
  assert.equal(h.snapshot().holes, 1); assert.equal(h.snapshot().advanced, 0); assert.equal(h.snapshot().steps, 0);
  h.click('primary-action'); h.click('secondary-action'); h.confirm('confirm');
  assert.equal(h.snapshot().full, false); assert.equal(h.snapshot().pieces, 0);
  h.click('tertiary-action');
  assert.equal(h.$('confirm-dialog').open, false);
  assert.equal(h.snapshot().full, true);
});

test('automatic follow can be disabled for button, direct-canvas and tool moves, including undo', async () => {
  const h = await setup();
  await h.execute('toggle_blueprint_cells', { cells: [[0, 0, 0], [0, 1, 0]] });
  h.click('primary-action');
  h.click('auto-follow');
  assert.equal(h.snapshot().view.autoFollow, false);
  assert.equal(h.$('auto-follow').getAttribute('aria-pressed'), 'false');
  for (const method of ['button', 'canvas', 'tool']) {
    if (method === 'tool') h.locate(24, -7, -5);
    else h.tap([0, 0, 0]);
    const before = h.snapshot().view;
    if (method === 'button') h.click('jump-yp');
    if (method === 'canvas') h.tap([0, 2, 0]);
    if (method === 'tool') await h.execute('move_conway_piece', { from: [0, 0, 0], to: [0, 2, 0] });
    assert.equal(h.snapshot().steps, 1, `${method} performed the jump`);
    assert.deepEqual(h.snapshot().differences, ['0,2,0']);
    assert.deepEqual(h.snapshot().view, before, `${method} preserves the chosen view`);
    h.click('tertiary-action');
    assert.equal(h.snapshot().steps, 0);
    assert.deepEqual(h.snapshot().view, before, `${method} undo preserves the chosen view`);
  }
  h.input('slice-value', '5');
  assert.equal(h.snapshot().view.slice, 5);
  h.locate(12, -3, -2);
  assert.equal(h.snapshot().view.slice, -3);
  assert.deepEqual(h.snapshot().view.center, [12, -2]);
  assert.equal(h.snapshot().view.autoFollow, false);
  const beforeReenable = h.snapshot().view;
  h.click('auto-follow');
  assert.equal(h.snapshot().view.autoFollow, true);
  assert.equal(h.$('auto-follow').getAttribute('aria-pressed'), 'true');
  assert.equal(h.snapshot().view.slice, beforeReenable.slice);
  assert.deepEqual(h.snapshot().view.center, beforeReenable.center);
  await h.execute('move_conway_piece', { from: [0, 0, 0], to: [0, 2, 0] });
  assert.equal(h.snapshot().view.slice, 2);
  assert.deepEqual(h.snapshot().view.center, [0, 0]);
  h.click('tertiary-action');
  assert.equal(h.snapshot().view.slice, 0);
});

for (const [name, delta] of [
  ['+X', [2, 0, 0]], ['−X', [-2, 0, 0]], ['+Y', [0, 2, 0]],
  ['−Y', [0, -2, 0]], ['+Z', [0, 0, 2]], ['−Z', [0, 0, -2]],
]) {
  test(`visible ${name} landing marker is directly clickable`, async () => {
    const h = await setup(), from = [0, 0, -2];
    const middle = from.map((value, axis) => value + delta[axis] / 2);
    const to = from.map((value, axis) => value + delta[axis]);
    await h.execute('toggle_blueprint_cells', { cells: [from, middle] });
    h.click('primary-action'); h.tap(from);
    assert.deepEqual(h.snapshot().selected, from);
    h.tap(to);
    assert.equal(h.snapshot().steps, 1);
    assert.deepEqual(h.snapshot().differences, [to.join(',')]);
    assert.equal(h.snapshot().view.slice, to[1]);
    h.click('tertiary-action');
    assert.equal(h.snapshot().view.slice, from[1]);
    assert.equal(h.snapshot().pieces, 2);
  });
}

for (const [yaw, sideY, expected] of [
  [Math.PI / 4, -1, [2, 0, -2]],
  [-Math.PI / 4, 1, [0, 2, -2]],
]) {
  test(`overlapping landing markers resolve to the foreground move at yaw ${yaw}`, async () => {
    const h = await setup();
    const from = [0, 0, -2];
    await h.execute('toggle_blueprint_cells', { cells: [from, [1, 0, -2], [0, sideY, -2]] });
    const previous = h.snapshot().view, pixel = [400, 300];
    const end = [pixel[0] + (yaw - previous.yaw) / .006, pixel[1] - previous.pitch / .0045];
    const mouse = { pointerType: 'mouse', button: 2 };
    h.dispatchPointer('pointerdown', 9001, pixel, mouse);
    h.dispatchPointer('pointermove', 9001, end, mouse);
    h.dispatchPointer('pointerup', 9001, end, mouse);
    assert.ok(Math.abs(h.snapshot().view.yaw - yaw) < 1e-10);
    assert.ok(Math.abs(h.snapshot().view.pitch) < 1e-10);
    h.click('primary-action'); h.tap(from);
    const xp = h.screen([2, 0, -2]), yp = h.screen([0, sideY * 2, -2]);
    assert.ok(Math.hypot(xp[0] - yp[0], xp[1] - yp[1]) < 1e-8, 'the targets share their screen center');
    h.tap([2, 0, -2]);
    assert.equal(h.snapshot().steps, 1);
    assert.ok(h.snapshot().differences.includes(expected.join(',')), 'the nearer target wins the click');
    assert.equal(h.snapshot().view.slice, expected[1]);
  });
}

test('numeric slice validation is atomic and coordinate locate changes the active editing plane', async () => {
  const h = await setup();
  h.tap([0, 0, 0]); h.click('primary-action'); h.tap([0, 0, 0]);
  for (const invalid of ['', '1.5', 'NaN', 'Infinity', String(CAMERA_LIMIT + 1)]) {
    const before = h.snapshot();
    h.input('slice-value', invalid);
    assert.deepEqual(h.snapshot(), before);
    assert.equal(h.$('slice-value').value, '0');
  }
  h.input('slice-value', '-12');
  assert.equal(h.snapshot().view.slice, -12);
  assert.equal(h.snapshot().selected, null);
  assert.equal(h.$('slice-range').value, '-12');
  h.input('slice-value', CAMERA_LIMIT);
  assert.equal(h.$('slice-next').disabled, true);
  h.input('slice-value', -CAMERA_LIMIT);
  assert.equal(h.$('slice-prev').disabled, true);
  h.click('primary-action');
  const beforeInvalidLocate = h.snapshot();
  h.locate(8, 5.5, -4); assert.deepEqual(h.snapshot(), beforeInvalidLocate);
  h.locate('', 3, 0); assert.deepEqual(h.snapshot(), beforeInvalidLocate);
  h.locate(8, -6, -4);
  assert.deepEqual(h.snapshot().view.center, [8, -4]);
  assert.equal(h.snapshot().view.slice, -6);
  assert.equal(h.snapshot().view.yaw, 0); assert.equal(h.snapshot().view.pitch, 0);
  assert.equal(document.activeElement, h.canvas);
  h.key(' ');
  assert.ok(h.snapshot().differences.includes('8,-6,-4'));
  h.key('ArrowRight'); h.key('Enter');
  assert.ok(h.snapshot().differences.includes('9,-6,-4'));
  h.key('q'); assert.equal(h.snapshot().view.slice, -7);
  h.key('e'); assert.equal(h.snapshot().view.slice, -6);
});

test('confirmation and info dialogs cancel held touches and block later board / tool actions', async () => {
  const h = await setup();
  h.tap([0, 0, 0]);
  const held = h.down([2, 0, -2]);
  h.click('secondary-action');
  assert.equal(h.$('confirm-dialog').open, true);
  const before = h.snapshot();
  h.tap([1, 0, -1]); h.key('Enter');
  await assert.rejects(h.execute('toggle_blueprint_cells', { cells: [[5, 0, -2]] }), /弹窗/);
  assert.deepEqual(h.snapshot(), before);
  h.confirm('confirm'); h.up(held);
  assert.equal(h.snapshot().pieces, 0);
  const secondHeld = h.down([3, 0, -2]);
  h.click('info'); assert.equal(h.$('info-dialog').open, true);
  h.tap([0, 0, -1]); h.key('Enter');
  assert.equal(h.snapshot().pieces, 0);
  h.click('close-info'); h.up(secondHeld);
  assert.equal(h.snapshot().pieces, 0);
  const thirdHeld = h.down([1, 0, -1]);
  window.dispatch('blur'); h.up(thirdHeld);
  assert.equal(h.snapshot().pieces, 0);
  const fourthHeld = h.down([1, 0, -1]);
  document.hidden = true; document.dispatch('visibilitychange'); document.hidden = false; h.up(fourthHeld);
  assert.equal(h.snapshot().pieces, 0);
});

test('slice slider keeps its range fixed while dragging and recenters only on commit / blur', async () => {
  const h = await setup();
  h.input('slice-range', '6', 'input');
  assert.equal(h.snapshot().view.slice, 6);
  assert.equal(Number(h.$('slice-range').min), -6);
  assert.equal(Number(h.$('slice-range').max), 6);
  h.input('slice-range', '5', 'input');
  assert.equal(Number(h.$('slice-range').min), -6);
  assert.equal(Number(h.$('slice-range').max), 6);
  h.input('slice-range', '6', 'input');
  h.input('slice-range', '6', 'change');
  assert.equal(Number(h.$('slice-range').min), 0);
  assert.equal(Number(h.$('slice-range').max), 12);
  h.input('slice-range', '12', 'input');
  assert.equal(h.snapshot().view.slice, 12);
  assert.equal(Number(h.$('slice-range').min), 0);
  assert.equal(Number(h.$('slice-range').max), 12);
  h.$('slice-range').dispatch('blur'); h.flush();
  assert.equal(Number(h.$('slice-range').min), 6);
  assert.equal(Number(h.$('slice-range').max), 18);
});

test('keyboard cursor beyond the finite render window stays visible and activation preserves action announcements', async () => {
  const h = await setup();
  h.locate(0, 0, 0);
  for (let i = 0; i < 5; i++) h.click('zoom-out');
  for (let i = 0; i < 15; i++) h.key('ArrowRight');
  assert.equal(h.snapshot().view.center[0], 0);
  h.key('ArrowRight');
  assert.equal(h.snapshot().view.center[0], 16);
  h.key(' ');
  assert.ok(h.snapshot().differences.includes('16,0,0'));
  assert.match(h.$('announcer').textContent, /已放子/);
  h.locate(16, 0, -1); h.key('Enter');
  assert.match(h.$('announcer').textContent, /已放子/);
  h.click('primary-action'); h.canvas.focus(); h.key('Enter');
  assert.deepEqual(h.snapshot().selected, [16, 0, -1]);
  assert.match(h.$('announcer').textContent, /选中/);
  h.key('ArrowUp'); h.key('ArrowUp'); h.key('Enter');
  assert.equal(h.snapshot().steps, 1);
  assert.match(h.$('announcer').textContent, /已跳到/);
  assert.match(h.$('announcer').textContent, /当前 1 步/);
});

test('structured tools reject malformed edits / moves atomically and execute valid 3D play', async () => {
  const h = await setup();
  for (const cells of [null, [[0, 0]], [[0, 0, 0], [0, 0, 1]], [[0, 0, 0], [NaN, 0, 0]], new Array(1001).fill([0, 0, 0])]) {
    const before = h.snapshot();
    await assert.rejects(h.execute('toggle_blueprint_cells', { cells }));
    assert.deepEqual(h.snapshot(), before);
  }
  const arranged = await h.execute('toggle_blueprint_cells', { cells: [[0, 0, 0], [0, 1, 0]] });
  assert.equal(arranged.pieces, 2);
  await h.execute('start_conway_game');
  for (const input of [{}, { from: [0, 0], to: [0, 2] }, { from: [0, 0, 0], to: [0, 1, 1] }]) {
    const before = h.snapshot();
    await assert.rejects(h.execute('move_conway_piece', input));
    assert.deepEqual(h.snapshot(), before);
  }
  const result = await h.execute('move_conway_piece', { from: [0, 0, 0], to: [0, 2, 0] });
  assert.equal(result.steps, 1); assert.equal(result.view.slice, 2);
  assert.deepEqual(result.differences, ['0,2,0']);
});

test('structured edit validation does not skip sparse coordinates or leave a partially modified layout', async () => {
  const h = await setup();
  const sparseCells = [[1, 0, -1]]; sparseCells.length = 2;
  for (const cells of [[[1, 0, -1], new Array(3)], sparseCells]) {
    const before = h.snapshot();
    await assert.rejects(h.execute('toggle_blueprint_cells', { cells }));
    assert.deepEqual(h.snapshot(), before);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Camera } from '../src/camera.js';

// A DOM/Canvas test double exercises the real app event handlers. This is not a
// browser-layout test and does not claim to emulate Safari or Android rendering.
class Element {
  constructor(id = '') {
    this.id = id; this.listeners = new Map(); this.attributes = new Map(); this.children = new Map();
    this.style = { setProperty() {} }; this.disabled = false; this.open = false; this.textContent = ''; this.innerHTML = '';
    this.clientWidth = 390; this.clientHeight = 844; this.captures = new Set();
    this.classList = { toggle() {} };
  }
  addEventListener(type, handler) { const handlers = this.listeners.get(type) || []; handlers.push(handler); this.listeners.set(type, handlers); }
  dispatch(type, event = {}) { for (const handler of this.listeners.get(type) || []) handler({ target: this, preventDefault() {}, ...event }); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  querySelector(name) { if (!this.children.has(name)) this.children.set(name, new Element()); return this.children.get(name); }
  append() {}
  focus() { document.activeElement = this; }
  showModal() { this.open = true; }
  close(value) { if (value !== undefined) this.returnValue = value; this.open = false; this.dispatch('close'); }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.dispatch('lostpointercapture', { pointerId: id }); }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight }; }
  getContext() { return context; }
}
const context = new Proxy({}, { get(target, property) {
  if (property in target) return target[property];
  if (property === 'createPattern') return () => ({ setTransform() {} });
  if (property === 'createLinearGradient') return () => ({ addColorStop() {} });
  if (property === 'measureText') return text => ({ width: text.length * 6 });
  return () => {};
} });
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
const registered = new Map(), frames = [];
const documentStub = new Element();
documentStub.getElementById = id => { assert.ok(elements.has(id), `missing HTML id: ${id}`); return elements.get(id); };
documentStub.createElement = () => new Element(); documentStub.body = new Element();
documentStub.modelContext = { registerTool(tool) { registered.set(tool.name, tool); } };
globalThis.document = documentStub;
globalThis.window = new Element(); window.devicePixelRatio = 2;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '0px' });
globalThis.ResizeObserver = class { observe() {} };
globalThis.DOMMatrix = class { translate() { return this; } scale() { return this; } };
globalThis.requestAnimationFrame = callback => frames.push(callback);
globalThis.fetch = async () => ({ ok: false });
await import('../src/app.js');
const flush = () => { while (frames.length) frames.shift()(); };
const $ = id => elements.get(id), canvas = $('board');
const snapshot = () => registered.get('read_conway_game').execute();
const camera = new Camera(); camera.resize(390, 844);
const down = (id, point) => { const [clientX, clientY] = camera.screen(...point); canvas.dispatch('pointerdown', { pointerId: id, clientX, clientY, pointerType: 'touch' }); };
const up = (id, point) => { const [clientX, clientY] = camera.screen(...point); canvas.dispatch('pointerup', { pointerId: id, clientX, clientY, pointerType: 'touch' }); flush(); };
let pointer = 1;
const tap = point => { const id = pointer++; down(id, point); up(id, point); };
const click = id => { $(id).dispatch('click'); flush(); };

test('app integration: layout → play → move → undo → confirmations → full board', async () => {
  flush();
  assert.equal(snapshot().pieces, 0); assert.equal($('primary-action').disabled, true);
  tap([0, 1]); assert.equal(snapshot().pieces, 0);
  tap([0, 0]); tap([0, -1]); assert.equal(snapshot().pieces, 2);
  click('primary-action'); assert.equal(snapshot().mode, 'play');
  assert.equal($('tertiary-action').disabled, true);
  tap([0, -1]); tap([0, 1]);
  assert.equal(snapshot().pieces, 1); assert.equal(snapshot().steps, 1);
  click('tertiary-action'); assert.equal(snapshot().pieces, 2); assert.equal(snapshot().steps, 0);
  tap([0, -1]); tap([0, 1]);
  click('primary-action'); assert.equal($('confirm-dialog').open, true);
  $('confirm-dialog').close('cancel'); assert.equal(snapshot().steps, 1); assert.equal(snapshot().mode, 'play');
  click('secondary-action'); $('confirm-dialog').close('confirm'); flush();
  assert.equal(snapshot().steps, 0); assert.equal(snapshot().pieces, 2); assert.equal(snapshot().mode, 'play');
  click('primary-action'); assert.equal(snapshot().mode, 'blueprint');
  // A held finger must not place a piece after resetting from a modal.
  down(900, [2, -2]); click('secondary-action');
  assert.equal($('confirm-dialog').open, true);
  $('confirm-dialog').close('confirm'); up(900, [2, -2]);
  assert.equal(snapshot().pieces, 0);
  click('tertiary-action'); assert.equal(snapshot().full, true); assert.equal(snapshot().holes, 0);
  tap([2, -2]); assert.equal(snapshot().holes, 1);
  click('secondary-action'); $('confirm-dialog').close('cancel');
  assert.equal(snapshot().holes, 1);
  click('primary-action'); tap([0, -1]); tap([0, 1]);
  assert.equal(snapshot().holes, 3); assert.equal(snapshot().advanced, 1); assert.equal(snapshot().steps, 1);
  click('secondary-action'); $('confirm-dialog').close('confirm'); flush();
  assert.equal(snapshot().holes, 1); assert.equal(snapshot().advanced, 0); assert.equal(snapshot().steps, 0);
  click('info'); assert.equal($('info-dialog').open, true);
  tap([0, -1]); tap([0, 1]); assert.equal(snapshot().steps, 0);
  click('close-info'); assert.equal($('info-dialog').open, false);
  click('sound'); assert.equal($('sound').attributes.get('aria-pressed'), 'false');
  click('zoom-in'); assert.equal($('view-scale').textContent, '125%');
  // Invalid structured edits fail before changing any cell.
  click('primary-action');
  const before = snapshot();
  await assert.rejects(registered.get('toggle_blueprint_cells').execute({ cells: [[0, -9], [0, 1]] }));
  assert.deepEqual(snapshot(), before);
  flush();
});

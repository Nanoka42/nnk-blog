import { test, expect, type Page } from '@playwright/test';
import { conway3dPath } from '../../config/redirects.mjs';

type Point = [number, number, number];
type View = {
  plane: 'XZ' | 'XY'; slice: number; depth: number; center: number[]; target: Point;
  yaw: number; pitch: number; zoom: number; pickable: boolean; autoFollow: boolean;
};
type Snapshot = { selected: Point | null; differences: string[]; steps: number; pieces: number; view: View };
type GameTools = Record<string, { execute: (input?: unknown) => unknown }>;
declare global { interface Window { conwayTestTools: GameTools } }
const errors = new WeakMap<Page, string[]>();

// Observe the game's existing optional API. All camera changes, selections and
// moves below still use real controls and browser mouse/touch/keyboard events.
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  await page.addInitScript(() => {
    const tools: GameTools = {};
    window.conwayTestTools = tools;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: { registerTool: (tool: { name: string; execute: (input?: unknown) => unknown }) => { tools[tool.name] = tool; } },
    });
  });
  await page.goto(conway3dPath);
  await expect(page.locator('#board')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.conwayTestTools.read_conway_game));
});

test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

const read = (page: Page) => page.evaluate(() =>
  window.conwayTestTools.read_conway_game.execute()) as Promise<Snapshot>;
const frame = (view: View) => ({ target: view.target, yaw: view.yaw, pitch: view.pitch, zoom: view.zoom });
const activate = (page: Page, selector: string, touch: boolean) =>
  touch ? page.locator(selector).tap() : page.locator(selector).click();

async function expectEdgeWarning(page: Page, visible: boolean) {
  const warning = page.locator('#edge-warning');
  if (!visible) {
    await expect(warning).toBeHidden();
    await expect(page.locator('#board-wrap')).not.toHaveClass(/is-edge-on/);
    await expect(page.locator('#board')).toHaveAttribute('aria-describedby', '');
    return;
  }
  await expect(warning).toBeVisible();
  await expect(warning).toHaveAttribute('role', 'status');
  await expect(warning).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#board')).toHaveAttribute('aria-describedby', 'edge-warning');
  await expect(page.locator('#board-wrap')).toHaveClass(/is-edge-on/);
  expect(await page.locator('#board-wrap').evaluate(element => {
    const border = getComputedStyle(element, '::after');
    return border.borderTopStyle === 'solid' && parseFloat(border.borderTopWidth) >= 2
      && border.pointerEvents === 'none';
  })).toBe(true);
  await expect(warning).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('#face-warning')).toHaveCSS('pointer-events', 'auto');
}

async function dragBoard(page: Page, dx: number, dy: number, touch: boolean) {
  const box = (await page.locator('#board').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (!touch) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
    return;
  }
  const client = await page.context().newCDPSession(page);
  try {
    // Ask Chromium to finish a complete touch gesture with no residual fling.
    // Raw dispatchTouchEvent move/end sequences can leave its gesture recognizer
    // suppressing the next button tap, even on a bare touch-action:none canvas.
    await client.send('Input.synthesizeScrollGesture', {
      x, y, xDistance: dx, yDistance: dy, gestureSourceType: 'touch', preventFling: true, speed: 240,
    });
  } finally { await client.detach(); }
}

// Use the exported projection to aim browser input at a world coordinate. This
// does not expose or mutate the live app camera/renderer or bypass hit testing.
async function tapPoint(page: Page, point: Point, touch: boolean) {
  const position = await page.evaluate(async point => {
    const snapshot = window.conwayTestTools.read_conway_game.execute() as Snapshot;
    const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src$="/src/app.js"]')!;
    const { Camera } = await import(new URL('./camera.js', script.src).href);
    const camera = new Camera();
    camera.resize(canvas.clientWidth, canvas.clientHeight);
    const { plane, slice, yaw, pitch, zoom, target } = snapshot.view;
    camera.setPlane(plane);
    Object.assign(camera, { slice, yaw, pitch, zoom, target });
    const [x, y] = camera.screen(...point);
    const box = canvas.getBoundingClientRect();
    return { x: box.x + x, y: box.y + y, inside: camera.inside(x, y) };
  }, point);
  expect(position.inside, `World point ${point} must be within the rendered working area`).toBe(true);
  if (touch) await page.touchscreen.tap(position.x, position.y);
  else await page.mouse.click(position.x, position.y);
}

test('slice orientation preserves the orbit and world center through mouse and touch navigation', async ({ page, hasTouch }, testInfo) => {
  await page.locator('#slice-value').fill('-3');
  await page.locator('#slice-value').press('Tab');
  await activate(page, '#pan-mode', hasTouch);
  await expect(page.locator('#pan-mode')).toHaveAttribute('aria-pressed', 'true');
  await dragBoard(page, 31, 19, hasTouch);
  const afterPan = await read(page);
  await activate(page, '#orbit-mode', hasTouch);
  await expect(page.locator('#orbit-mode')).toHaveAttribute('aria-pressed', 'true');
  await dragBoard(page, 43, 27, hasTouch);
  const afterOrbit = await read(page);
  expect(afterOrbit.view.target).toEqual(afterPan.view.target);
  expect(afterOrbit.view.yaw).not.toBe(afterPan.view.yaw);
  expect(afterOrbit.view.pitch).not.toBe(afterPan.view.pitch);
  expect(afterOrbit.pieces).toBe(0);
  await activate(page, '#zoom-in', hasTouch);
  await expect.poll(async () => (await read(page)).view.zoom).toBeGreaterThan(1);
  const before = await read(page);
  expect(before.view.target[0]).not.toBe(0);
  expect(before.view.zoom).toBeGreaterThan(1);

  await activate(page, '#plane-xy', hasTouch);
  const xy = await read(page);
  expect(xy.view.plane).toBe('XY');
  expect(xy.view.slice).toBe(Math.round(before.view.target[2]));
  expect(frame(xy.view)).toEqual(frame(before.view));
  expect(xy.selected).toBeNull();
  await expect(page.locator('#plane-xy')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#plane-xz')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#plane-badge')).toContainText(`Z = ${xy.view.slice}`);
  await expect(page.locator('#neighbor-legend')).toHaveAttribute('aria-label', /Z/);

  await activate(page, '#plane-xz', hasTouch);
  expect(frame((await read(page)).view)).toEqual(frame(before.view));
  await expect(page.locator('#slice-value')).toHaveValue('-3');
  await activate(page, '#face', hasTouch);
  expect((await read(page)).view.pickable).toBe(true);
  await activate(page, '#plane-xy', hasTouch);
  expect((await read(page)).view.pickable).toBe(false);
  await expectEdgeWarning(page, true);
  await activate(page, '#face-warning', hasTouch);
  expect((await read(page)).view.pickable).toBe(true);
  await expectEdgeWarning(page, false);
  await expect(page.locator('#legend-positive')).toHaveClass(/is-far/);
  await expect(page.locator('#legend-negative')).not.toHaveClass(/is-far/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('game-3d-xy.png'), fullPage: true });
});

test('selected pieces survive plane switching and overlapping XY handles follow the nearer destination', async ({ page, hasTouch }, testInfo) => {
  const from: Point = [0, 0, -1];
  const cells: Point[] = [from, [-1, 0, -1], [1, 0, -1], [0, -1, -1], [0, 1, -1], [0, 0, -2], [0, 0, 0]];
  await page.evaluate(cells => window.conwayTestTools.toggle_blueprint_cells.execute({ cells }), cells);
  await activate(page, '#primary-action', hasTouch);
  await activate(page, '#face', hasTouch);
  // Keyboard navigation brings the source into view even on the smallest board;
  // selection itself is a real canvas tap/click.
  await page.locator('#board').focus();
  for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowDown');
  await tapPoint(page, from, hasTouch);
  const selected = await read(page);
  expect(selected.selected).toEqual(from);

  await activate(page, '#plane-xy', hasTouch);
  const switched = await read(page);
  expect(switched.view.plane).toBe('XY');
  expect(switched.view.slice).toBe(-1);
  expect(switched.selected).toEqual(from);
  expect(frame(switched.view)).toEqual(frame(selected.view));
  await expect(page.locator('#selection-label')).toHaveText('X 0 / Y 0 / Z -1');
  for (const direction of ['xm', 'xp', 'ym', 'yp', 'zm', 'zp']) await expect(page.locator(`#jump-${direction}`)).toBeEnabled();
  await expectEdgeWarning(page, true);
  await expect(page.locator('#edge-hint')).toContainText('选子');
  await expect(page.locator('#edge-detail')).toContainText('仍可点击可见落点');
  await page.screenshot({ path: testInfo.outputPath('game-3d-xy-edge-handles.png'), fullPage: true });

  // The warning and its border must leave visible jump handles interactive,
  // even while selecting a new piece on the edge-on plane is suspended.
  await tapPoint(page, [-2, 0, -1], hasTouch);
  await expect(page.locator('#steps')).toHaveText('1');
  expect((await read(page)).differences).toContain('-2,0,-1');
  await expectEdgeWarning(page, true);
  await activate(page, '#tertiary-action', hasTouch);
  await expect(page.locator('#steps')).toHaveText('0');
  expect(new Set((await read(page)).differences)).toEqual(new Set(cells.map(point => point.join(','))));

  await activate(page, '#face', hasTouch);
  await expectEdgeWarning(page, false);
  await tapPoint(page, from, hasTouch);
  await page.screenshot({ path: testInfo.outputPath('game-3d-xy-handles.png'), fullPage: true });
  // In the XY front view, the ±Z handles coincide. The −Z destination is
  // nearer; a single pointer action must select it, never the hidden +Z handle.
  await tapPoint(page, [0, 0, -3], hasTouch);
  await expect(page.locator('#steps')).toHaveText('1');
  await expect(page.locator('#pieces')).toHaveText('6');
  await expect(page.locator('#slice-value')).toHaveValue('-3');
  expect((await read(page)).differences).toContain('0,0,-3');
  expect((await read(page)).differences).not.toContain('0,0,1');
  await activate(page, '#tertiary-action', hasTouch);
  await expect(page.locator('#steps')).toHaveText('0');
  await expect(page.locator('#slice-value')).toHaveValue('-1');
  expect(new Set((await read(page)).differences)).toEqual(new Set(cells.map(point => point.join(','))));

  await tapPoint(page, from, hasTouch);
  await activate(page, '#auto-follow', hasTouch);
  const stationary = (await read(page)).view;
  await activate(page, '#jump-zp', hasTouch);
  expect((await read(page)).differences).toContain('0,0,1');
  expect((await read(page)).view).toEqual(stationary);
  await activate(page, '#tertiary-action', hasTouch);
  expect((await read(page)).view).toEqual(stationary);
  await expect(page.locator('#steps')).toHaveText('0');

  // Tilting the XY plane separates its normal-axis handles, restoring direct
  // canvas access to the previously hidden +Z destination.
  await tapPoint(page, from, hasTouch);
  await dragBoard(page, 0, 110, hasTouch);
  await page.screenshot({ path: testInfo.outputPath('game-3d-xy-oblique.png'), fullPage: true });
  await tapPoint(page, [0, 0, 1], hasTouch);
  await expect(page.locator('#steps')).toHaveText('1');
  expect((await read(page)).differences).toContain('0,0,1');
  await expect(page.locator('#slice-value')).toHaveValue('-1');
});

test('XY editing and slice controls use Y in the plane and Z between planes', async ({ page, hasTouch }) => {
  await activate(page, '#plane-xy', hasTouch);
  await expect(page.locator('#slice-value')).toHaveValue('2');
  await activate(page, '#face', hasTouch);
  await tapPoint(page, [0, 0, 2], hasTouch);
  await expect(page.locator('#pieces')).toHaveText('0');
  await expect(page.locator('#toast')).toContainText('Z ≤ 0');
  await activate(page, '#slice-prev', hasTouch);
  await activate(page, '#slice-prev', hasTouch);
  await expect(page.locator('#slice-value')).toHaveValue('0');
  await tapPoint(page, [0, 0, 0], hasTouch);
  await page.locator('#board').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  expect(new Set((await read(page)).differences)).toEqual(new Set(['0,0,0', '0,1,0']));
  await page.keyboard.press('e');
  await expect(page.locator('#slice-value')).toHaveValue('1');
  await page.keyboard.press('q');
  await expect(page.locator('#slice-value')).toHaveValue('0');
  await page.locator('#slice-value').fill('-4');
  await page.locator('#slice-value').press('Tab');
  await activate(page, '#slice-next', hasTouch);
  await expect(page.locator('#slice-value')).toHaveValue('-3');
  await page.locator('#slice-range').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#slice-value')).toHaveValue('-2');
  await expect(page.locator('#plane-badge')).toContainText('XY');
  await expect(page.locator('#plane-badge')).toContainText('Z = -2');
  await page.locator('#depth').selectOption('2');
  expect((await read(page)).view.depth).toBe(2);
  expect((await read(page)).view.pickable).toBe(true);
});

test('edge-on warning is prominent, preserves board gestures and clears at the narrower threshold', async ({ page, hasTouch }, testInfo) => {
  await activate(page, '#face', hasTouch);
  await activate(page, '#plane-xy', hasTouch);
  await page.locator('#slice-value').fill('0');
  await page.locator('#slice-value').press('Tab');
  await expectEdgeWarning(page, true);
  await expect(page.locator('#edge-hint')).toContainText('摆子');
  await expect(page.locator('#edge-detail')).toContainText('拖动旋转');
  const boardSize = await page.locator('#board').boundingBox();
  await tapPoint(page, [0, 0, 0], hasTouch);
  await expect(page.locator('#pieces')).toHaveText('0');
  await page.screenshot({ path: testInfo.outputPath('game-3d-xy-edge-warning.png'), fullPage: true });

  // 110 px of pointer movement changes pitch by approximately 0.495 radians.
  // Chromium's synthesized touch scroll includes 15 px of initial touch slop,
  // so request 95 px there. The resulting normal depth lies between .45 and .5:
  // the new guard allows editing where the old one blocked it.
  await dragBoard(page, 0, hasTouch ? 95 : 110, hasTouch);
  const oblique = await read(page);
  expect(Math.abs(Math.sin(oblique.view.pitch))).toBeGreaterThan(0.45);
  expect(Math.abs(Math.sin(oblique.view.pitch))).toBeLessThan(0.5);
  expect(oblique.view.pickable).toBe(true);
  await expectEdgeWarning(page, false);
  expect(await page.locator('#board').boundingBox()).toEqual(boardSize);
  await tapPoint(page, [0, 0, 0], hasTouch);
  await expect(page.locator('#pieces')).toHaveText('1');

  // Returning to a side view restores the warning; its explicit recovery
  // button must work with both mouse and touch input.
  await activate(page, '#plane-xz', hasTouch);
  await activate(page, '#face', hasTouch);
  await activate(page, '#plane-xy', hasTouch);
  await expectEdgeWarning(page, true);
  await activate(page, '#face-warning', hasTouch);
  await expectEdgeWarning(page, false);
  expect((await read(page)).view.pickable).toBe(true);
});

test('edge warning and its recovery button fit a narrow phone without covering the board center', async ({ page, hasTouch }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await activate(page, '#face', hasTouch);
  await activate(page, '#plane-xy', hasTouch);
  await expectEdgeWarning(page, true);
  const board = (await page.locator('#board').boundingBox())!;
  const warning = (await page.locator('#edge-warning').boundingBox())!;
  const face = (await page.locator('#face-warning').boundingBox())!;
  expect(warning.x).toBeGreaterThanOrEqual(board.x);
  expect(warning.x + warning.width).toBeLessThanOrEqual(board.x + board.width);
  expect(warning.y).toBeGreaterThanOrEqual(board.y);
  expect(warning.y + warning.height).toBeLessThan(board.y + board.height / 2);
  expect(face.x).toBeGreaterThanOrEqual(warning.x);
  expect(face.x + face.width).toBeLessThanOrEqual(warning.x + warning.width);
  expect(face.y + face.height).toBeLessThanOrEqual(warning.y + warning.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('game-3d-edge-warning-320.png'), fullPage: true });
  await activate(page, '#face-warning', hasTouch);
  await expectEdgeWarning(page, false);
});

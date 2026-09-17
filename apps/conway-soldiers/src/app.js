import { Game, isCoordinate } from './engine.js';
import { Camera, MIN_ZOOM, MAX_ZOOM } from './camera.js';
import { Renderer } from './renderer.js';
import { BoardGesture } from './gestures.js';
import { SoundBank } from './audio.js';
import { registerGameTools } from './webmcp.js';

const $ = id => document.getElementById(id);
const game = new Game();
const camera = new Camera();
const canvas = $('board');
const renderer = new Renderer(canvas, camera, game);
const sounds = new SoundBank();
const buttons = [$('primary-action'), $('secondary-action'), $('tertiary-action')];
const confirmDialog = $('confirm-dialog'), infoDialog = $('info-dialog');
let toastTimer, pendingConfirmation = null, modalOpener = null;
let keyboardCursor = null, latestMode = null;

function announce(message) { $('announcer').textContent = message; }
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2600);
}
const format = number => number === Infinity ? '∞' : number.toLocaleString('zh-CN');
const blocked = () => confirmDialog.open || infoDialog.open;

function updateView() {
  $('home').disabled = camera.originVisible;
  $('zoom-in').disabled = camera.zoom >= MAX_ZOOM - 1e-10;
  $('zoom-out').disabled = camera.zoom <= MIN_ZOOM + 1e-10;
  $('view-scale').textContent = `${Math.round(camera.zoom * 100)}%`;
  renderer.request();
}
function update() {
  const stats = game.board.stats(), blueprint = game.mode === 'blueprint';
  if (game.mode !== latestMode) {
    const controls = blueprint
      ? [['play', '开始跳棋'], ['trash_can', '清空棋子'], ['piece_all', '放满棋子']]
      : [['blueprint', '回到蓝图'], ['restart', '重玩这局'], ['undo', '撤回一步']];
    controls.forEach(([icon, label], i) => {
      buttons[i].querySelector('img').src = new URL(`../icons/${icon}.png`, import.meta.url).href;
      buttons[i].title = label; buttons[i].setAttribute('aria-label', label);
      if (i === 0) buttons[i].querySelector('span').textContent = label;
    });
    document.body.classList.toggle('playing', !blueprint);
    latestMode = game.mode;
  }
  buttons[0].disabled = blueprint && stats.pieces === 0;
  buttons[1].disabled = false;
  buttons[2].disabled = !blueprint && game.steps === 0;
  $('mode-name').textContent = blueprint ? '蓝图模式' : '跳棋模式';
  $('mode-detail').textContent = blueprint ? '自由摆子' : '向上探索';
  $('stats').innerHTML = blueprint
    ? `<div class="stat"><span class="stat-value">${format(game.board.full ? stats.holes : stats.pieces)}</span><span class="stat-label">${game.board.full ? '空格' : '棋子'}</span></div>`
    : `<div class="stat"><span class="stat-value">${format(stats.pieces)}</span>${game.board.full ? '' : `<span class="stat-initial">/ ${format(game.initial.differences.size)}</span>`}<span class="stat-label">棋子</span></div><div class="stat"><span class="stat-value">${format(game.steps)}</span><span class="stat-label">步</span></div>`;
  $('status-caption').textContent = blueprint
    ? game.board.full ? '下半平面已无限填满 · 点击可挖空' : '棋盘无限，探索也无限。'
    : game.board.full ? `下方空格 ${format(stats.holes)} · 上方棋子 ${format(stats.advanced)}` : '当前 / 开局 · 每次跳跃减少一枚棋子';
  $('action-help').textContent = blueprint ? '点击 y ≤ 0 的格子，放置或移除棋子'
    : game.selected ? game.board.movesFrom(...game.selected).length ? '点击亮起的落点，完成跳跃' : '这枚棋子暂时无路可走，试试其他棋子' : '选择一枚棋子，向上探索';
  updateView();
}
function afterMove(previousPeak) {
  sounds.play('move');
  if (game.peak > previousPeak && game.peak > 0) toast(`抵达第 ${game.peak} 行${game.peak === 4 ? '，漂亮！' : '！'}`);
  announce(`跳跃完成，已走 ${game.steps} 步。`);
}
function tap(x, y) {
  if (blocked()) return;
  const previousPeak = game.peak, action = game.click(x, y);
  if (action === 'edit') { sounds.play('edit'); announce(`x=${x}，y=${y}，${game.board.has(x, y) ? '已放置棋子' : '空格'}。`); }
  else if (action === 'move') afterMove(previousPeak);
  else if (action === 'locked') toast('蓝图只能在 y ≤ 0 的区域摆子');
  else if (action === 'select') {
    const destinations = game.board.movesFrom(x, y);
    announce(`选中 x=${x}，y=${y}。${destinations.length ? `可跳至 ${destinations.map(([a, b]) => `(${a},${b})`).join('、')}` : '没有可用落点'}。`);
  }
  update();
}
function doReset(mode) {
  gestures.cancel();
  if (mode === 'clear' || mode === 'fill') game.setBaseline(mode === 'fill');
  else game.restore(mode);
  sounds.play('reset'); renderer.hover = null;
  update(); announce(mode === 'blueprint' ? '已恢复开局蓝图。' : mode === 'play' ? '已重新开始本局。' : mode === 'fill' ? '已无限填满下半平面。' : '已清空棋盘。');
}
function askConfirmation(title, description, actionLabel, action) {
  if (blocked()) return;
  gestures.cancel();
  modalOpener = document.activeElement;
  pendingConfirmation = action;
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  $('confirm-accept').textContent = actionLabel;
  confirmDialog.returnValue = 'cancel'; confirmDialog.showModal();
}
confirmDialog.addEventListener('close', () => {
  const action = pendingConfirmation; pendingConfirmation = null;
  if (confirmDialog.returnValue === 'confirm') action?.();
  modalOpener?.focus({ preventScroll: true });
});
function action(index) {
  if (blocked()) return;
  gestures.cancel();
  if (game.mode === 'blueprint') {
    if (index === 0) {
      if (game.start()) { update(); announce('开始跳棋。选择棋子后点击可用落点。'); }
      return;
    }
    const fill = index === 2, run = () => doReset(fill ? 'fill' : 'clear');
    if (game.needsLayoutConfirmation) askConfirmation(fill ? '放满整个下半平面？' : '清空所有棋子？', '当前的摆子布局会被替换，此操作无法撤回。', fill ? '放满棋子' : '清空棋子', run);
    else run();
  } else if (index === 2) {
    if (game.undo()) { sounds.play('undo'); update(); announce(`已撤回一步，当前 ${game.steps} 步。`); }
  } else {
    const blueprint = index === 0, run = () => doReset(blueprint ? 'blueprint' : 'play');
    if (game.steps > 0) askConfirmation(blueprint ? '回到开局蓝图？' : '重新开始这一局？', `已走的 ${game.steps} 步将被清除，棋盘恢复为本局开局时的布局。`, blueprint ? '回到蓝图' : '重玩这局', run);
    else run();
  }
}
buttons.forEach((button, index) => button.addEventListener('click', () => action(index)));
$('home').addEventListener('click', () => { gestures.cancel(); camera.home(); renderer.hover = null; updateView(); });
$('zoom-in').addEventListener('click', () => { gestures.cancel(); camera.zoomAt(1.25, ...camera.midpoint); renderer.hover = null; updateView(); });
$('zoom-out').addEventListener('click', () => { gestures.cancel(); camera.zoomAt(.8, ...camera.midpoint); renderer.hover = null; updateView(); });
$('sound').addEventListener('click', () => {
  sounds.setEnabled(!sounds.enabled);
  $('sound').setAttribute('aria-pressed', String(sounds.enabled));
  $('sound').title = sounds.enabled ? '关闭声音' : '开启声音';
  $('sound').querySelector('img').src = new URL(`../icons/${sounds.enabled ? 'sound' : 'sound_muted'}.png`, import.meta.url).href;
  announce(sounds.enabled ? '声音已开启。' : '声音已关闭。');
});
$('info').addEventListener('click', () => {
  if (blocked()) return;
  gestures.cancel(); modalOpener = document.activeElement; infoDialog.showModal();
});
$('close-info').addEventListener('click', () => infoDialog.close());
infoDialog.addEventListener('close', () => modalOpener?.focus({ preventScroll: true }));
for (const dialog of [confirmDialog, infoDialog]) {
  let beganOutside = false;
  const outside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
  dialog.addEventListener('pointerdown', event => { beganOutside = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => { if (event.target === dialog && beganOutside && outside(event)) dialog.close('cancel'); beganOutside = false; });
}
document.addEventListener('pointerdown', event => {
  sounds.unlock();
  if (event.target !== canvas) gestures.cancel();
}, { capture: true, passive: true });
document.addEventListener('keydown', () => sounds.unlock(), { capture: true });

const gestures = new BoardGesture(camera, {
  change: () => { renderer.hover = null; updateView(); }, tap,
  drag: value => canvas.classList.toggle('is-dragging', value),
});
function local(event) { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; }
canvas.addEventListener('pointerdown', event => {
  if (blocked() || (event.pointerType === 'mouse' && event.button !== 0)) return;
  renderer.cursor = null; keyboardCursor = null;
  gestures.down(event.pointerId, ...local(event), event.pointerType);
  canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true });
});
canvas.addEventListener('pointermove', event => {
  if (blocked()) return;
  const [x, y] = local(event); gestures.move(event.pointerId, x, y);
  if (event.pointerType === 'mouse' && !gestures.pointers.size) {
    renderer.hover = camera.inside(x, y) ? camera.hit(x, y) : null; renderer.request();
  }
});
canvas.addEventListener('pointerup', event => {
  gestures.up(event.pointerId, ...local(event));
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener('pointercancel', event => gestures.up(event.pointerId, ...local(event), true));
canvas.addEventListener('lostpointercapture', event => { if (gestures.pointers.has(event.pointerId)) gestures.up(event.pointerId, 0, 0, true); });
canvas.addEventListener('pointerleave', () => { renderer.hover = null; renderer.request(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', event => {
  event.preventDefault(); if (blocked()) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? camera.height : 1;
  camera.zoomAt(Math.exp(-Math.max(-400, Math.min(400, event.deltaY * unit)) * .0018), ...local(event));
  renderer.hover = null; updateView();
}, { passive: false });
window.addEventListener('blur', () => gestures.cancel());
document.addEventListener('visibilitychange', () => { if (document.hidden) gestures.cancel(); });
canvas.addEventListener('keydown', event => {
  if (blocked() || event.ctrlKey || event.metaKey || event.altKey) return;
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  const pan = { a: [1, 0], d: [-1, 0], w: [0, 1], s: [0, -1] };
  if (arrows[event.key] || event.key === ' ' || event.key === 'Enter') {
    event.preventDefault(); keyboardCursor ??= camera.hit(...camera.midpoint);
    if (arrows[event.key]) keyboardCursor = keyboardCursor.map((value, i) => value + arrows[event.key][i]);
    else tap(...keyboardCursor);
    if (!camera.inside(...camera.screen(...keyboardCursor))) { camera.center = [...keyboardCursor]; camera.constrain(); }
    renderer.cursor = keyboardCursor;
    announce(`光标 x=${keyboardCursor[0]}，y=${keyboardCursor[1]}，${game.board.has(...keyboardCursor) ? '有棋子' : '空格'}。`);
  } else if (pan[event.key.toLowerCase()]) {
    event.preventDefault(); camera.pan(...pan[event.key.toLowerCase()].map(value => value * camera.cell));
  } else if (['+', '=', '-', '_'].includes(event.key)) {
    event.preventDefault(); camera.zoomAt(['+', '='].includes(event.key) ? 1.25 : .8, ...camera.midpoint);
  } else if (event.key === 'Escape') { game.selected = null; renderer.cursor = null; keyboardCursor = null; update(); }
  else return;
  updateView();
});
canvas.addEventListener('blur', () => { renderer.cursor = null; renderer.request(); });

// Keep the board clear of notches and the home indicator.
const safeArea = document.createElement('div');
safeArea.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.append(safeArea);
function resize() {
  const style = getComputedStyle(safeArea);
  const inset = side => parseFloat(style.getPropertyValue(`padding-${side}`)) || 0;
  camera.resize(canvas.clientWidth, canvas.clientHeight, { top: inset('top'), right: inset('right'), bottom: inset('bottom'), left: inset('left') });
  const rect = camera.rect;
  for (const [name, value] of Object.entries({ left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top })) {
    document.body.style.setProperty(`--board-${name}`, `${value}px`);
  }
  gestures.cancel(); renderer.resize(); updateView();
}
new ResizeObserver(resize).observe(canvas); window.addEventListener('resize', resize);
resize(); update();

registerGameTools({
  snapshot: () => ({ mode: game.mode, full: game.board.full, differences: [...game.board.differences], steps: game.steps, ...game.board.stats(), pieces: game.board.full ? 'infinite' : game.board.differences.size }),
  edit: cells => {
    if (blocked() || game.mode !== 'blueprint') throw new Error('只能在未打开弹窗的蓝图模式下编辑。');
    if (!Array.isArray(cells) || cells.length > 1000 || cells.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(isCoordinate) || p[1] > 0)) throw new Error('需要最多 1000 个整数坐标，且 y ≤ 0。');
    gestures.cancel();
    for (const [x, y] of cells) game.click(x, y);
    if (cells.length) sounds.play('edit'); update();
  },
  start: () => { if (blocked() || !game.start()) throw new Error('需要先在蓝图中摆放棋子，且关闭弹窗。'); gestures.cancel(); update(); },
  move: (from, to) => {
    if (blocked() || !Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2 || ![...from, ...to].every(isCoordinate)) throw new Error('坐标或页面状态无效。');
    const previousPeak = game.peak;
    if (!game.move(from, to)) throw new Error('不是合法的跳跃。');
    gestures.cancel();
    afterMove(previousPeak); update();
  },
});

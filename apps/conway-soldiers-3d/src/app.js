import { Game, isCoordinate } from './engine.js';
import { Camera, MIN_ZOOM, MAX_ZOOM, CAMERA_LIMIT } from './camera.js';
import { Renderer, neighborStyle, TARGET_COLORS } from './renderer.js';
import { BoardGesture } from './gestures.js';
import { SoundBank } from './audio.js';
import { registerGameTools } from './webmcp.js';

const $ = id => document.getElementById(id);
const game = new Game(), camera = new Camera(), canvas = $('board');
const renderer = new Renderer(canvas, camera, game), sounds = new SoundBank();
const confirmDialog = $('confirm-dialog'), infoDialog = $('info-dialog');
const jumpButtons = ['jump-zp','jump-zm','jump-xm','jump-xp','jump-ym','jump-yp'].map($);
const format = n => n === Infinity ? '∞' : n.toLocaleString('zh-CN');
const coords = p => `(${p.join(', ')})`;
let dragMode = 'orbit', keyboardCursor = null, autoFollow = true;
let pendingConfirmation = null, modalOpener = null, toastTimer;
let rangeCenter = 0, slidingSlice = false;
const blocked = () => confirmDialog.open || infoDialog.open;
const announce = message => { $('announcer').textContent = message; };
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function clearCursor() { renderer.hover = null; renderer.cursor = null; keyboardCursor = null; }
function updateView() {
  $('plane-badge').textContent = `XZ 工作面 · Y = ${camera.slice}`;
  $('slice-value').value = camera.slice;
  if (!slidingSlice && Math.abs(camera.slice - rangeCenter) > 5) rangeCenter = camera.slice;
  const min = Math.max(-CAMERA_LIMIT,rangeCenter - 6), max = Math.min(CAMERA_LIMIT,rangeCenter + 6);
  $('slice-range').min = min; $('slice-range').max = max; $('slice-range').value = camera.slice;
  $('slice-min').textContent = min; $('slice-max').textContent = max;
  $('slice-prev').disabled = camera.slice <= -CAMERA_LIMIT; $('slice-next').disabled = camera.slice >= CAMERA_LIMIT;
  $('depth').value = camera.depth;
  $('view-scale').textContent = `${Math.round(camera.zoom * 100)}%`;
  $('zoom-in').disabled = camera.zoom >= MAX_ZOOM; $('zoom-out').disabled = camera.zoom <= MIN_ZOOM;
  $('edge-warning').hidden = camera.pickable;
  $('edge-hint').textContent = game.mode === 'blueprint' ? '侧视：请正视后摆子' : '侧视：仍可点击可见落点';
  for (const [id, offset] of [['legend-negative', -1], ['legend-positive', 1]]) {
    const style = neighborStyle(offset, camera);
    $(id).classList.toggle('is-far', style.far);
    $(id).style.borderColor = style.color;
  }
  $('neighbor-legend').setAttribute('aria-label', `邻层：蓝色为 Y− 侧，紫色为 Y+ 侧；虚线表示距摄像机较远的一侧`);
  renderer.request();
}
function update() {
  const s = game.board.stats(), blueprint = game.mode === 'blueprint';
  document.body.classList.toggle('playing', !blueprint);
  $('mode-name').textContent = blueprint ? '蓝图模式' : '跳棋模式';
  $('pieces').textContent = format(s.pieces);
  $('initial-pieces').textContent = !blueprint && !game.board.full ? ` / ${format(game.initial.differences.size)}` : '';
  $('steps').textContent = format(game.steps);
  $('peak').replaceChildren(document.createTextNode(String(game.peak)), Object.assign(document.createElement('span'), {textContent:'/ 7'}));
  $('primary-action').innerHTML = blueprint ? '开始跳棋 <span>→</span>' : '回到蓝图 <span>↗</span>';
  $('primary-action').disabled = blueprint && s.pieces === 0;
  $('secondary-action').textContent = blueprint ? '清空棋子' : '重玩这局';
  $('secondary-action').disabled = blueprint && !game.board.full && s.pieces === 0;
  $('tertiary-action').textContent = blueprint ? '无限填满' : '撤回一步';
  $('tertiary-action').disabled = blueprint ? game.board.full && s.holes === 0 : game.steps === 0;
  $('status-caption').textContent = game.board.full ? `下方空格 ${format(s.holes)} · 上方棋子 ${format(s.advanced)}` : blueprint ? '摆放区域：Z ≤ 0' : '棋子：当前 / 开局';
  $('auto-follow').setAttribute('aria-pressed', String(autoFollow));
  $('auto-follow').title = autoFollow ? '已开启：跳跃和撤回时跟随棋子' : '已关闭：跳跃和撤回时保持当前切片与视图';
  $('selection-label').textContent = game.selected ? `X ${game.selected[0]} / Y ${game.selected[1]} / Z ${game.selected[2]}` : '选择一枚棋子';
  $('deselect').hidden = !game.selected;
  let moveCount = 0;
  for (const button of jumpButtons) {
    const delta = button.dataset.direction.split(',').map(Number), to = game.selected?.map((v,i)=>v+delta[i]);
    button.style.setProperty('--axis-color', TARGET_COLORS['XYZ'[delta.findIndex(v => v !== 0)]]);
    const legal = !blueprint && to && game.board.canMove(game.selected,to);
    button.disabled = !legal;
    button.title = legal ? `跳至 ${coords(to)}${delta[1] ? autoFollow ? '，自动跟随' : '，保持当前切片' : ''}` : '此方向暂时不能跳跃';
    button.setAttribute('aria-label', `${button.querySelector('b').textContent}，${button.title}`);
    if (legal) moveCount++;
  }
  $('selection-help').textContent = game.selected ? moveCount ? `${moveCount} 个方向 · 灰色落点被遮挡，可旋转视角或使用按钮` : '暂无可用落点' : '选择棋子后，点击落点或方向按钮';
  $('action-help').textContent = blueprint ? '点击格点摆子 · Z ≤ 0' : game.selected ? moveCount ? '点击落点跳跃 · 灰色落点暂不可点' : '暂无可用落点' : '选择当前工作面的棋子';
  updateView();
}
function followPoint(point, forceCenter = false) {
  camera.slice = point[1];
  const p = camera.screen(...point), b = camera.bounds();
  if (forceCenter || point[0] < b.minX || point[0] > b.maxX || point[2] < b.minZ || point[2] > b.maxZ || !camera.inside(...p) || p[0] < 65 || p[0] > camera.width - 65 || p[1] < 55 || p[1] > camera.height - 65) camera.center = [point[0],point[2]];
}
function afterMove(to, previousPeak) {
  sounds.play('move'); if (autoFollow) followPoint(to); clearCursor();
  if (game.peak > previousPeak && game.peak > 0) toast(`抵达第 ${game.peak} 层${game.peak === 7 ? '，触及三维的探索边界！' : '！'}`);
  announce(`已跳到 ${coords(to)}，当前 ${game.steps} 步，工作切片 Y=${camera.slice}。`);
}
function tap(x,y,z) {
  if (blocked()) return;
  const previousPeak = game.peak, result = game.click(x,y,z);
  if (result === 'edit') { sounds.play('edit'); announce(`${coords([x,y,z])}，${game.board.has(x,y,z) ? '已放子' : '已移除'}。`); }
  else if (result === 'move') afterMove([x,y,z],previousPeak);
  else if (result === 'locked') toast('开局只能在 Z ≤ 0 的半空间摆子');
  else if (result === 'select') announce(`选中 ${coords([x,y,z])}，${game.board.movesFrom(x,y,z).length} 个可走方向。`);
  else if (result === 'deselect') announce('已取消选择。');
  update();
}
function moveTo(to) {
  if (blocked() || !game.selected) return false;
  const previousPeak = game.peak;
  if (!game.move(game.selected,to)) return false;
  gestures.cancel(); afterMove(to,previousPeak); update(); return true;
}
const gestures = new BoardGesture(camera, { mode:()=>dragMode, tap, pick:(x,y)=>renderer.pick(x,y),
  change:()=>{ renderer.hover = null; updateView(); },
  drag:value=>canvas.classList.toggle('is-dragging',value),
});
function setSlice(value) {
  if (blocked()) return;
  if (!isCoordinate(value) || Math.abs(value) > CAMERA_LIMIT) { toast(`请输入 ±${format(CAMERA_LIMIT)} 以内的整数切片坐标`); updateView(); return; }
  gestures.cancel(); camera.slice = value; game.selected = null; clearCursor(); update();
  announce(`工作切片 Y=${camera.slice}。`);
}
function askConfirmation(title, description, label, action) {
  if (blocked()) return;
  gestures.cancel(); modalOpener = document.activeElement; pendingConfirmation = action;
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  $('confirm-accept').textContent = label; confirmDialog.returnValue = 'cancel'; confirmDialog.showModal();
}
confirmDialog.addEventListener('close',()=>{
  const run = pendingConfirmation; pendingConfirmation = null;
  if (confirmDialog.returnValue === 'confirm') run?.();
  modalOpener?.focus({preventScroll:true});
});
function reset(which) {
  gestures.cancel(); clearCursor();
  if (which === 'clear' || which === 'fill') game.setBaseline(which === 'fill');
  else game.restore(which);
  sounds.play('reset'); update();
  announce(which === 'fill' ? '整个 Z≤0 半空间已无限填满。' : '棋盘已恢复。');
}
function action(index) {
  if (blocked()) return;
  gestures.cancel();
  if (game.mode === 'blueprint') {
    if (index === 0) { if (game.start()) { update(); announce('开始跳棋。'); } return; }
    const fill = index === 2, run = ()=>reset(fill ? 'fill' : 'clear');
    if (game.board.full || game.board.differences.size) askConfirmation(fill ? '无限填满下半空间？' : '清空整个棋盘？','所有切片中的当前布局会被替换，此操作无法撤回。',fill ? '无限填满' : '清空棋子',run);
    else run();
  } else if (index === 2) {
    const last = game.history.at(-1);
    if (game.undo()) { sounds.play('undo'); if (autoFollow) followPoint(last.from); clearCursor(); update(); announce(`已撤回到 ${game.steps} 步。`); }
  } else {
    const blueprint = index === 0, run = ()=>reset(blueprint ? 'blueprint' : 'play');
    if (game.steps) askConfirmation(blueprint ? '回到开局蓝图？' : '重玩这一局？',`已走的 ${game.steps} 步会被清除，所有切片恢复到开局布局。`,blueprint ? '回到蓝图' : '重玩这局',run);
    else run();
  }
}
['primary-action','secondary-action','tertiary-action'].forEach((id,i)=>$(id).addEventListener('click',()=>action(i)));
for (const button of jumpButtons) button.addEventListener('click',()=> { if (game.selected) moveTo(game.selected.map((v,i)=>v+Number(button.dataset.direction.split(',')[i]))); });
$('deselect').addEventListener('click',()=>{game.selected=null;update();});
$('auto-follow').addEventListener('click',()=>{
  if (blocked()) return;
  gestures.cancel(); autoFollow = !autoFollow; update();
  announce(autoFollow ? '自动跟随已开启。' : '自动跟随已关闭，跳跃和撤回时保持当前视图。');
});
$('slice-prev').addEventListener('click',()=>setSlice(camera.slice-1));
$('slice-next').addEventListener('click',()=>setSlice(camera.slice+1));
$('slice-value').addEventListener('change',()=>setSlice($('slice-value').value.trim() ? Number($('slice-value').value) : NaN));
$('slice-range').addEventListener('input',()=>{slidingSlice=true;setSlice(Number($('slice-range').value));});
$('slice-range').addEventListener('change',()=>{slidingSlice=false;updateView();});
$('slice-range').addEventListener('blur',()=>{slidingSlice=false;updateView();});
$('depth').addEventListener('change',()=>{gestures.cancel();camera.depth=Number($('depth').value);updateView();});
function setDragMode(mode) { gestures.cancel(); dragMode=mode; $('orbit-mode').setAttribute('aria-pressed',String(mode==='orbit')); $('pan-mode').setAttribute('aria-pressed',String(mode==='pan')); }
$('orbit-mode').addEventListener('click',()=>setDragMode('orbit'));
$('pan-mode').addEventListener('click',()=>setDragMode('pan'));
function face() { gestures.cancel(); camera.face(); renderer.hover=null; updateView(); }
$('face').addEventListener('click',face); $('face-warning').addEventListener('click',face);
$('home').addEventListener('click',()=>{gestures.cancel();camera.home();game.selected=null;clearCursor();update();});
for (const [id,factor] of [['zoom-in',1.2],['zoom-out',1/1.2]]) $(id).addEventListener('click',()=>{gestures.cancel();camera.zoomAt(factor,...camera.midpoint);renderer.hover=null;updateView();});
$('locate-form').addEventListener('submit',event=>{
  event.preventDefault(); if(blocked())return;
  const p=['locate-x','locate-y','locate-z'].map(id=>$(id).value.trim()?Number($(id).value):NaN);
  if(!p.every(v=>isCoordinate(v)&&Math.abs(v)<=CAMERA_LIMIT)){toast('请输入有效的整数坐标');return;}
  gestures.cancel();followPoint(p,true);camera.face();game.selected=null;clearCursor();keyboardCursor=p;renderer.cursor=p;update();canvas.focus({preventScroll:true});
});
$('sound').addEventListener('click',()=>{sounds.setEnabled(!sounds.enabled);$('sound').setAttribute('aria-pressed',String(sounds.enabled));$('sound').textContent=sounds.enabled?'♫':'♪';$('sound').title=sounds.enabled?'关闭声音':'开启声音';announce(sounds.enabled?'声音已开启':'声音已关闭');});
$('info').addEventListener('click',()=>{if(blocked())return;gestures.cancel();modalOpener=document.activeElement;infoDialog.showModal();});
$('close-info').addEventListener('click',()=>infoDialog.close());
infoDialog.addEventListener('close',()=>modalOpener?.focus({preventScroll:true}));
for(const dialog of [confirmDialog,infoDialog]){
  let beganOutside=false;
  const outside=e=>{const r=dialog.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
  dialog.addEventListener('pointerdown',e=>{beganOutside=e.target===dialog&&outside(e);});
  dialog.addEventListener('click',e=>{if(e.target===dialog&&beganOutside&&outside(e))dialog.close('cancel');beganOutside=false;});
}
document.addEventListener('pointerdown',e=>{sounds.unlock();if(e.target!==canvas)gestures.cancel();},{capture:true,passive:true});
document.addEventListener('keydown',()=>sounds.unlock(),{capture:true});
const local=e=>{const r=canvas.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];};
canvas.addEventListener('pointerdown',e=>{if(blocked()||(e.pointerType==='mouse'&&![0,1,2].includes(e.button)))return;clearCursor();gestures.down(e.pointerId,...local(e),e.pointerType,e.button??0,e.shiftKey);canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
canvas.addEventListener('pointermove',e=>{if(blocked())return;const p=local(e);gestures.move(e.pointerId,...p);if(e.pointerType==='mouse'&&!gestures.pointers.size){renderer.hover=camera.inside(...p)?renderer.pick(...p):null;renderer.request();}});
canvas.addEventListener('pointerup',e=>{gestures.up(e.pointerId,...local(e));if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
canvas.addEventListener('pointercancel',e=>gestures.up(e.pointerId,...local(e),true));
canvas.addEventListener('lostpointercapture',e=>{if(gestures.pointers.has(e.pointerId))gestures.up(e.pointerId,0,0,true);});
canvas.addEventListener('pointerleave',()=>{renderer.hover=null;renderer.request();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();if(blocked())return;const unit=e.deltaMode===1?16:e.deltaMode===2?camera.height:1;camera.zoomAt(Math.exp(-Math.max(-400,Math.min(400,e.deltaY*unit))*.0018),...local(e));renderer.hover=null;updateView();},{passive:false});
window.addEventListener('blur',()=>gestures.cancel());
document.addEventListener('visibilitychange',()=>{if(document.hidden)gestures.cancel();});
canvas.addEventListener('keydown',e=>{
  if(blocked()||e.ctrlKey||e.metaKey||e.altKey)return;
  const key=e.key.toLowerCase(), arrows={arrowleft:[-1,0,0],arrowright:[1,0,0],arrowup:[0,0,1],arrowdown:[0,0,-1]};
  if(arrows[key]||key===' '||key==='enter'){
    e.preventDefault();const cursor=keyboardCursor??[Math.round(camera.center[0]),camera.slice,Math.round(camera.center[1])];
    if(arrows[key]) { const next=cursor.map((v,i)=>v+arrows[key][i]);keyboardCursor=next.every(v=>Math.abs(v)<=CAMERA_LIMIT)?next:cursor; }
    else { tap(...cursor);keyboardCursor=cursor; }
    followPoint(keyboardCursor);renderer.cursor=keyboardCursor;
    if(arrows[key]) announce(`光标 ${coords(keyboardCursor)}，${game.board.has(...keyboardCursor)?'有棋子':'空格'}。`);
  }else if(['q','e','pageup','pagedown'].includes(key)){e.preventDefault();setSlice(camera.slice+(['q','pageup'].includes(key)?-1:1));return;}
  else if(['w','a','s','d'].includes(key)){e.preventDefault();const p={w:[0,1],a:[1,0],s:[0,-1],d:[-1,0]}[key];camera.pan(p[0]*camera.cell,p[1]*camera.cell);}
  else if(['+','=','-','_'].includes(key)){e.preventDefault();camera.zoomAt(['+','='].includes(key)?1.2:1/1.2,...camera.midpoint);}
  else if(key==='f'){e.preventDefault();camera.face();}
  else if(key==='h'){e.preventDefault();camera.home();game.selected=null;clearCursor();update();}
  else if(key==='escape'){game.selected=null;clearCursor();update();}
  else return;
  updateView();
});
canvas.addEventListener('blur',()=>{renderer.cursor=null;renderer.request();});
function resize(){gestures.cancel();camera.resize(canvas.clientWidth,canvas.clientHeight);renderer.resize();updateView();}
new ResizeObserver(resize).observe(canvas);window.addEventListener('resize',resize);
resize();update();

registerGameTools({
  snapshot:()=>({mode:game.mode,full:game.board.full,differences:[...game.board.differences],steps:game.steps,peak:game.peak,selected:game.selected?[...game.selected]:null,...game.board.stats(),pieces:game.board.full?'infinite':game.board.differences.size,view:{slice:camera.slice,depth:camera.depth,center:[...camera.center],zoom:camera.zoom,yaw:camera.yaw,pitch:camera.pitch,pickable:camera.pickable,autoFollow}}),
  edit:cells=>{
    if(blocked()||game.mode!=='blueprint')throw new Error('需要在未打开弹窗的蓝图模式编辑。');
    if(!Array.isArray(cells)||cells.length>1000||[...cells].some(p=>!Array.isArray(p)||p.length!==3||![p[0],p[1],p[2]].every(isCoordinate)||p[2]>0))throw new Error('需要最多1000个三维整数坐标，且 Z≤0。');
    gestures.cancel();for(const p of cells)game.click(...p);if(cells.length)sounds.play('edit');update();
  },
  start:()=>{if(blocked()||!game.start())throw new Error('请先摆子并关闭弹窗。');gestures.cancel();update();},
  move:(from,to)=>{if(blocked())throw new Error('请先关闭弹窗。');const previousPeak=game.peak;if(!game.move(from,to))throw new Error('不是合法的六向跳跃。');gestures.cancel();afterMove(to,previousPeak);update();},
});

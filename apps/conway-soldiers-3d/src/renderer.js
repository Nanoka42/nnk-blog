import { clamp, labelStep } from './camera.js';

const BG = '#0b1319';
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
const TAU = Math.PI * 2;
const same = (a, b) => Boolean(a && b && a.every((value, i) => value === b[i]));
const pieceRadius = cell => clamp(cell * .224, 2.4, 21);
const ghostRadius = cell => clamp(cell * .145, 3.1, 12.5);
const gridRadius = cell => clamp(cell * .032, 1.1, 2.4);
const targetRadius = cell => clamp(cell * .265, 6, 24);

export const TARGET_COLORS = Object.freeze({
  X: '#efb58f', Y: '#9bcafa', Z: '#a0e3c1',
});

// Color identifies the signed normal coordinate; outline identifies depth. Compare each
// ghost with its corresponding site on the active plane, so orbiting through
// the back of the board swaps solid/dashed without swapping the world colors.
export const neighborStyle = (offset, camera = {}) => {
  const normalDepth = camera.normalDepth ?? (camera.plane === 'XY' ? Math.sin(camera.pitch ?? 0)
    : Math.cos(camera.pitch ?? 0) * Math.cos(camera.yaw ?? 0));
  const far = normalDepth * offset < -1e-7;
  return { color: offset < 0 ? '#86bff1' : '#d1a5ed', dash: far ? [3, 3] : [],
    opacity: Math.abs(offset) === 1 ? .56 : .32, far };
};

const overlapFraction = (distance, radius) => {
  const ratio = clamp(distance / (radius * 2), 0, 1);
  return (2 * Math.acos(ratio) - 2 * ratio * Math.sqrt(1 - ratio * ratio)) / Math.PI;
};

export class Renderer {
  constructor(canvas, camera, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.camera = camera; this.game = game; this.cursor = null; this.hover = null;
    this.frame = null; this.dpr = 1;
    this.targetSelection = ''; this.blockedTargets = new Set();
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
  }
  resize() {
    this.dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.camera.width * this.dpr);
    this.canvas.height = Math.round(this.camera.height * this.dpr);
    this.request();
  }
  request() {
    if (this.frame === null) this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }
  draw() { this.render(); }
  targets() {
    const { selected, board } = this.game, c = this.camera;
    const moves = selected ? board.movesFrom(...selected) : [];
    const selection = JSON.stringify([selected, moves]);
    if (selection !== this.targetSelection) {
      this.targetSelection = selection; this.blockedTargets.clear();
    }
    const targets = moves.map((point, order) => {
      const axis = point.findIndex((value, i) => value !== selected[i]);
      return { point, p: c.screen(...point), radius: targetRadius(c.cell), order,
        key: point.join(','), color: TARGET_COLORS['XYZ'[axis]],
        label: `${point[axis] > selected[axis] ? '+' : '−'}${'XYZ'[axis]}` };
    });
    // Match painter order: larger projected depth is nearer. Equal depths use
    // move order, so coincident circles never create two ambiguous hit targets.
    targets.sort((a, b) => Math.abs(a.p[2] - b.p[2]) > 1e-7 ? a.p[2] - b.p[2] : a.order - b.order);
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i], wasBlocked = this.blockedTargets.has(target.key);
      target.occluded = targets.slice(i + 1).some(nearer => {
        const distance = Math.hypot(target.p[0] - nearer.p[0], target.p[1] - nearer.p[1]);
        // Enter at a meaningful overlap; leave only after the whole circle has
        // emerged, with half a pixel tolerance for antialiasing at tangency.
        return wasBlocked ? distance < target.radius + nearer.radius - .5
          : overlapFraction(distance, target.radius) > .15;
      });
      if (target.occluded) this.blockedTargets.add(target.key);
      else this.blockedTargets.delete(target.key);
    }
    return targets;
  }
  pick(px, py) {
    const c = this.camera, { board } = this.game;
    if (!c.inside(px, py)) return null;
    const distance = p => Math.hypot(px - p[0], py - p[1]);
    // Explicit destinations work on both planes, including side views where
    // inverse-plane picking is unsafe. A gray target consumes the click too.
    for (const target of this.targets().reverse()) {
      if (distance(target.p) <= target.radius + 1) return target.occluded ? null : target.point;
    }
    const point = c.hit(px, py);
    if (!point) return null;
    const activeDistance = distance(c.screen(...point));
    // Visible current-plane objects win even when a hollow contextual marker
    // happens to overlap them. Elsewhere, keep generous whole-cell tap targets.
    if (board.has(...point) && activeDistance <= pieceRadius(c.cell) + .5) return point;
    if (activeDistance <= gridRadius(c.cell) + 2) return point;
    if (!c.depth) return point;
    const b = c.bounds(), minV = b[`min${c.verticalLabel}`], maxV = b[`max${c.verticalLabel}`];
    // Invert the pointer onto each visible neighboring plane. Since picking is disabled
    // for strongly foreshortened planes, these nearest 3×3 sites contain every
    // possible ghost silhouette: at most 36 candidates, even in a full world.
    for (let offset = -c.depth; offset <= c.depth; offset++) {
      if (offset === 0) continue;
      const world = c.world(px, py, c.slice + offset);
      if (!world) continue;
      const gx = Math.round(world[0]), gv = Math.round(world[c.verticalAxis]);
      for (let x = gx - 1; x <= gx + 1; x++) for (let v = gv - 1; v <= gv + 1; v++) {
        if (x < b.minX || x > b.maxX || v < minV || v > maxV) continue;
        const ghost = c.point(x, v, c.slice + offset);
        if (distance(c.screen(...ghost)) <= ghostRadius(c.cell) + 1.5 && board.has(...ghost)) return null;
      }
    }
    return point;
  }
  line(a, b, color, width = 1, dash = []) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }
  worldLine(a, b, color, width = 1, dash = []) { this.line(this.camera.screen(...a), this.camera.screen(...b), color, width, dash); }
  circle(x, y, radius, fill, stroke, width = 1) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, radius), 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }
  polygon(points, fill, stroke) {
    const ctx = this.ctx;
    ctx.beginPath(); points.forEach((point, i) => { const p = this.camera.screen(...point); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  render() {
    const ctx = this.ctx, c = this.camera, b = c.bounds(), { board } = this.game;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, c.width, c.height);
    const glow = ctx.createRadialGradient(c.width * .5, c.height * .52, 0, c.width * .5, c.height * .52, Math.max(c.width, c.height) * .58);
    glow.addColorStop(0, '#19302e80'); glow.addColorStop(.6, '#14262928'); glow.addColorStop(1, '#0b131900');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, c.width, c.height);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, c.width, c.height); ctx.clip();
    this.grid(b);
    const nodes = [];
    // Occupancy is queried only for the finite visible window. The logical
    // half-space may be infinite; rendering cost never depends on that fact.
    const minV = b[`min${c.verticalLabel}`], maxV = b[`max${c.verticalLabel}`];
    for (let slice = c.slice - c.depth; slice <= c.slice + c.depth; slice++) {
      const active = slice === c.slice;
      for (let v = minV; v <= maxV; v++) for (let x = b.minX; x <= b.maxX; x++) {
        const point = c.point(x, v, slice), p = c.screen(...point);
        if (p[0] < -30 || p[0] > c.width + 30 || p[1] < -30 || p[1] > c.height + 30) continue;
        const occupied = board.has(...point);
        if (occupied || active) nodes.push({ point, p, active, occupied, selected: same(this.game.selected, point) });
        else if (c.cell > 23 && point[2] <= 0) nodes.push({ point, p, active: false, occupied: false });
      }
    }
    nodes.sort((a, b) => a.p[2] - b.p[2]);
    for (const node of nodes) this.node(node);
    this.selection();
    if (this.hover && this.hover[c.normalAxis] === c.slice && c.pickable) {
      const editable = this.game.mode !== 'blueprint' || this.hover[2] <= 0;
      if (editable) this.focus(this.hover, '#b1e7db85', false);
    }
    if (this.cursor && this.cursor[c.normalAxis] === c.slice) this.focus(this.cursor, '#d9fff0', false);
    this.fadeEdges();
    ctx.restore();
    this.labels(b);
    this.triad();
  }
  grid(b) {
    const c = this.camera, { minX, maxX } = b;
    const minV = b[`min${c.verticalLabel}`], maxV = b[`max${c.verticalLabel}`];
    const x0 = minX - .45, x1 = maxX + .45, v0 = minV - .45, v1 = maxV + .45;
    const corners = [c.point(x0, v0), c.point(x1, v0), c.point(x1, v1), c.point(x0, v1)];
    this.polygon(corners, '#13212448');
    if (c.plane === 'XZ' && minV <= 0) {
      this.polygon([c.point(x0, v0), c.point(x1, v0), c.point(x1, Math.min(.4, v1)), c.point(x0, Math.min(.4, v1))], '#3d877610');
    } else if (c.plane === 'XY') {
      // Z is constant across this whole plane: the start/goal heights are plane
      // attributes, never horizontal Y rails masquerading as world Z levels.
      const fill = c.slice <= 0 ? '#3d877610' : c.slice === 7 ? '#d3af620d' : c.slice >= 8 ? '#ad858a09' : null;
      const stroke = c.slice === 0 ? '#89d9bc65' : c.slice === 7 ? '#d3af6259' : c.slice === 8 ? '#ad858a40' : null;
      if (fill || stroke) this.polygon(corners, fill, stroke);
    }
    // Sparse rails describe the third dimension without putting a cage around
    // the board. Ghost layers never contribute an interactive grid.
    if (c.depth && Math.abs(c.normalDepth) < .9999 && minV <= 0 && maxV >= 0) {
      for (const offset of [-c.depth, c.depth]) {
        const style = neighborStyle(offset, c), slice = c.slice + offset;
        this.worldLine(c.point(x0, 0, slice), c.point(x1, 0, slice), `${style.color}29`, 1, style.dash);
        for (const x of [minX, 0, maxX]) if (x >= minX && x <= maxX) this.worldLine(c.point(x, 0), c.point(x, 0, slice), `${style.color}24`, 1, [2, 5]);
      }
    }
    for (let x = minX; x <= maxX; x++) this.worldLine(c.point(x, v0), c.point(x, v1), x === 0 ? '#8aaca429' : '#8aaca412', x === 0 ? 1 : .65);
    for (let v = minV; v <= maxV; v++) {
      const heightRail = c.plane === 'XZ';
      const color = heightRail ? v === 0 ? '#89d9bc65' : v === 7 ? '#d3af6259' : v === 8 ? '#ad858a28' : v < 0 ? '#9acbb11a' : '#b5ced414'
        : v === 0 ? '#89d9bc65' : '#b5ced414';
      // Both work planes give their current X reference rail priority over
      // the thinner, translucent rails on neighboring slices.
      this.worldLine(c.point(x0, v), c.point(x1, v), color, v === 0 ? 1.5 : .75,
        heightRail && v === 7 ? [5, 7] : heightRail && v === 8 ? [2, 7] : []);
    }
  }
  node({ point, p, active, occupied, selected }) {
    const c = this.camera, ctx = this.ctx, [px, py] = p;
    if (!active) {
      const style = neighborStyle(point[c.normalAxis] - c.slice, c);
      ctx.save(); ctx.globalAlpha = style.opacity * (occupied ? 1 : .72);
      ctx.setLineDash(occupied ? style.dash : style.dash.length ? [1.5, 2] : []);
      this.circle(px, py, occupied ? ghostRadius(c.cell) : clamp(c.cell * .056, 1.8, 3.1),
        occupied ? '#0b1319' : null, style.color, occupied ? 1.2 : 1);
      ctx.setLineDash([]);
      if (occupied) this.circle(px, py, 1.2, style.color);
      ctx.restore();
      if (selected) this.focus(point, '#f7dfa0c0', true);
      return;
    }
    if (!occupied) {
      this.circle(px, py, gridRadius(c.cell), point[2] <= 0 ? '#8ec9b959' : '#99b9c02f');
      return;
    }
    const radius = pieceRadius(c.cell), advanced = point[2] > 0;
    this.circle(px + 1, py + radius * .25, radius * 1.2, '#00000030');
    const gradient = ctx.createRadialGradient(px - radius * .34, py - radius * .4, radius * .07, px, py, radius * 1.1);
    gradient.addColorStop(0, advanced ? '#ffe2ab' : '#d0fce9');
    gradient.addColorStop(.35, advanced ? '#e8c280' : '#a6e9cf');
    gradient.addColorStop(.8, advanced ? '#b78d50' : '#62b698');
    gradient.addColorStop(1, advanced ? '#846338' : '#33795f');
    this.circle(px, py, radius, gradient, advanced ? '#e8c9898a' : '#bbf7da7a', .75);
    this.circle(px - radius * .24, py - radius * .34, radius * .15, '#ffffff30');
    if (selected) this.focus(point, '#f7dfa0', true);
  }
  focus(point, color, selected) {
    const c = this.camera, ctx = this.ctx, [x, y] = c.screen(...point), r = clamp(c.cell * (selected ? .33 : .37), 8, 30);
    if (selected) {
      this.circle(x, y, r + 4, '#e4c26a10');
      this.circle(x, y, r, null, color, 1.6);
      return;
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath();
    const len = r * .4;
    for (const [sx, sy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      ctx.moveTo(x + sx * (r - len), y + sy * r); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * r, y + sy * (r - len));
    }
    ctx.stroke();
  }
  selection() {
    const { selected } = this.game, ctx = this.ctx;
    const targets = this.targets();
    for (const target of targets) {
      this.worldLine(selected, target.point, target.occluded ? '#78818b50' : `${target.color}78`, 1.2, [4, 5]);
    }
    for (const { p: [x, y], radius, label, color, occluded } of targets) {
      // Opaque fills preserve the same front-to-back order used for picking.
      ctx.setLineDash(occluded ? [3, 3] : []);
      this.circle(x, y, radius, '#182027', occluded ? '#83909b' : color, occluded ? 1.2 : 1.8);
      ctx.setLineDash([]);
      ctx.font = `600 ${clamp(radius * .85, 8, 11)}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = occluded ? '#8d99a3' : color; ctx.fillText(label, x, y + .5);
    }
  }
  chip(text, x, y, color, size = 10) {
    const ctx = this.ctx;
    ctx.font = `500 ${size}px ${FONT}`;
    const width = ctx.measureText(text).width + 12, height = size + 10;
    if (x < 6 || y < 6 || x + width > this.camera.width - 6 || y + height > this.camera.height - 6) return;
    ctx.fillStyle = '#0b1319e8'; ctx.beginPath(); ctx.roundRect(x, y, width, height, 5); ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, x + 6, y + height / 2);
  }
  labels(b) {
    const c = this.camera, ctx = this.ctx;
    // Leave the upper area clear for the DOM picking warning in side views.
    if (!c.pickable) return;
    if (c.plane === 'XY') {
      const description = c.slice === 0 ? '起始边界' : c.slice < 0 ? '可摆子区域'
        : c.slice === 7 ? '有限步可达' : c.slice >= 8 ? '不可到达' : '向第 7 层推进';
      const color = c.slice <= 0 ? '#a0d8c2' : c.slice < 8 ? '#d8b775' : '#8e7c82';
      this.chip(`Z = ${c.slice} · ${description}`, 18, 16, color, c.width < 500 ? 9 : 10);
    }
    const minV = b[`min${c.verticalLabel}`], maxV = b[`max${c.verticalLabel}`];
    const labelX = clamp(c.world(42, c.midpoint[1])[0], b.minX, b.maxX);
    ctx.font = `10px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const step = labelStep(35 / c.cell);
    for (let v = Math.ceil(minV / step) * step; v <= maxV; v += step) {
      if (c.plane === 'XZ' && (v === 0 || v === 7 || v === 8)) continue;
      const [x, y] = c.screen(...c.point(labelX, v));
      if (x > 25 && x < c.width - 25 && y > 44 && y < c.height - 62) {
        ctx.fillStyle = '#66837f'; ctx.fillText(`${c.verticalLabel} ${v > 0 ? '+' : ''}${v}`, x - 14, y);
      }
    }
    if (c.plane === 'XZ') {
      for (const [z, text, color] of [[0, 'Z = 0 · 起始边界', '#a0d8c2'], [7, '+7 · 有限步可达', '#d8b775'], [8, '+8 · 不可到达', '#8e7c82']]) {
        if (z < b.minZ || z > b.maxZ) continue;
        const desiredX = z === 0 ? 32 : Math.max(32, c.width - 202);
        const railX = clamp(c.world(desiredX, c.midpoint[1])[0], b.minX, b.maxX);
        const [x, y] = c.screen(...c.point(railX, z));
        this.chip(text, Math.max(12, x - 8), y - 27, color, c.width < 500 ? 9 : 10);
      }
    }
    // Coordinates stay tied to the plane, rather than implying that a cropped
    // viewport is the boundary of the mathematical board.
    const bottomV = clamp(c.world(c.midpoint[0], c.height - 70)[c.verticalAxis], minV + 1, maxV);
    for (let x = Math.ceil(b.minX / 2) * 2; x <= b.maxX; x += 2) {
      const [px, py] = c.screen(...c.point(x, bottomV));
      if (px > 28 && px < c.width - 28 && py > 20 && py < c.height - 32) {
        ctx.textAlign = 'center'; ctx.fillStyle = '#536e6b'; ctx.fillText(`X ${x}`, px, py + 19);
      }
    }
  }
  triad() {
    const c = this.camera, ctx = this.ctx, ox = c.width - 54, oy = 76;
    const [x, y, z] = c.target, center = c.screen(x, y, z), length = 25 / c.cell;
    const axes = [
      ['X', '#c7a593', c.screen(x + length, y, z)],
      ['Y', '#9eaeca', c.screen(x, y + length, z)],
      ['Z', '#93d3b7', c.screen(x, y, z + length)],
    ].sort((a, b) => a[2][2] - b[2][2]);
    this.circle(ox, oy, 2, '#80958e');
    ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [name, color, p] of axes) {
      const dx = p[0] - center[0], dy = p[1] - center[1];
      if (Math.hypot(dx, dy) < 4) { this.circle(ox, oy, 5, null, color, .8); continue; }
      this.line([ox, oy], [ox + dx, oy + dy], color, 1.1);
      const n = Math.hypot(dx, dy); ctx.fillStyle = color; ctx.fillText(name, ox + dx + dx / n * 9, oy + dy + dy / n * 9);
    }
  }
  fadeEdges() {
    const ctx = this.ctx, c = this.camera, depth = Math.min(55, c.width * .1, c.height * .1);
    for (const [x0, y0, x1, y1, x, y, w, h] of [
      [0, 0, depth, 0, 0, 0, depth, c.height],
      [c.width, 0, c.width - depth, 0, c.width - depth, 0, depth, c.height],
      [0, 0, 0, depth, 0, 0, c.width, depth],
      [0, c.height, 0, c.height - depth, 0, c.height - depth, c.width, depth],
    ]) {
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1); gradient.addColorStop(0, BG); gradient.addColorStop(1, '#0b131900');
      ctx.fillStyle = gradient; ctx.fillRect(x, y, w, h);
    }
  }
}

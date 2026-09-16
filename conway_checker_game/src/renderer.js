import { labelStep, clamp } from './camera.js';
import { pointOf } from './engine.js';

const PAPER = '#f3eee4';
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
function surface(size) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}
function makeWood() {
  const [canvas, ctx] = surface(256);
  ctx.fillStyle = '#e2cdab'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#c3a781'; ctx.fillRect(0, 0, 128, 128); ctx.fillRect(128, 128, 128, 128);
  // Deterministic, low-contrast grain; all graphics are generated locally.
  for (let y = 0; y < 256; y += 3) {
    ctx.strokeStyle = y % 2 ? '#ffffff0b' : '#6f4d2510';
    ctx.lineWidth = .7; ctx.beginPath();
    ctx.moveTo(0, y); ctx.bezierCurveTo(75, y - 4, 180, y + 4, 256, y); ctx.stroke();
  }
  return canvas;
}
function makePiece() {
  const [canvas, ctx] = surface(128);
  ctx.shadowColor = '#30251840'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
  let gradient = ctx.createLinearGradient(30, 15, 85, 100);
  gradient.addColorStop(0, '#46644d'); gradient.addColorStop(.6, '#293f31'); gradient.addColorStop(1, '#172d24');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(64, 64, 44, 0, 2 * Math.PI); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#142b20'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(64, 62, 39, 0, 2 * Math.PI); ctx.strokeStyle = '#a5b18c66'; ctx.lineWidth = 1.5; ctx.stroke();
  gradient = ctx.createLinearGradient(40, 30, 75, 90); gradient.addColorStop(0, '#192e24'); gradient.addColorStop(1, '#47604a');
  ctx.beginPath(); ctx.arc(64, 63, 27, 0, 2 * Math.PI); ctx.fillStyle = gradient; ctx.fill();
  ctx.strokeStyle = '#102619a0'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(64, 63, 27, .12, Math.PI * .91); ctx.strokeStyle = '#b0b89270'; ctx.lineWidth = 1; ctx.stroke();
  return canvas;
}

export class Renderer {
  constructor(canvas, camera, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera; this.game = game; this.cursor = null; this.hover = null;
    this.wood = makeWood(); this.piece = makePiece();
    this.woodPattern = this.ctx.createPattern(this.wood, 'repeat');
    const [full, fullCtx] = surface(256);
    for (const x of [0, 128]) for (const y of [0, 128]) fullCtx.drawImage(this.piece, x, y);
    this.fullPattern = this.ctx.createPattern(full, 'repeat');
    const [hatch, hatchCtx] = surface(18);
    hatchCtx.strokeStyle = '#29372d16'; hatchCtx.lineWidth = 1;
    for (const offset of [-18, 0, 18]) { hatchCtx.beginPath(); hatchCtx.moveTo(offset, 18); hatchCtx.lineTo(offset + 18, 0); hatchCtx.stroke(); }
    this.hatch = this.ctx.createPattern(hatch, 'repeat'); this.frame = null;
  }
  request() {
    if (this.frame === null) this.frame = requestAnimationFrame(() => { this.frame = null; this.draw(); });
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.camera.width * dpr);
    this.canvas.height = Math.round(this.camera.height * dpr);
    this.request();
  }
  checkerRect(x, y, w, h) {
    this.ctx.fillStyle = this.woodPattern; this.ctx.fillRect(x, y, w, h);
  }
  draw() {
    const ctx = this.ctx, c = this.camera, r = c.rect, s = c.cell, game = this.game;
    const width = r.right - r.left, height = r.bottom - r.top;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, c.width, c.height);
    const [ox, oy] = c.screen(0, 0), horizon = oy - s / 2;
    // Reduce pattern translation modulo its period to avoid precision loss far from the origin.
    const tx = (ox - s / 2) % (s * 2), ty = (oy - s / 2) % (s * 2);
    const matrix = new DOMMatrix().translate(tx, ty).scale(s / 128);
    this.woodPattern.setTransform(matrix); this.fullPattern.setTransform(matrix);
    ctx.save(); ctx.beginPath(); ctx.rect(r.left, r.top, width, height); ctx.clip();
    this.checkerRect(r.left, r.top, width, height);
    // Tint only; the original dark/light parity remains visible underneath.
    ctx.fillStyle = '#b75f6240'; ctx.fillRect(ox - s / 2, r.top, s, height);
    ctx.fillStyle = '#527a5959'; ctx.fillRect(r.left, oy - s / 2, width, s);
    if (game.mode === 'blueprint') {
      const boundary = clamp(horizon, r.top, r.bottom);
      ctx.fillStyle = '#6e9eae30'; ctx.fillRect(r.left, boundary, width, r.bottom - boundary);
      ctx.fillStyle = this.hatch; ctx.fillRect(r.left, r.top, width, boundary - r.top);
      this.blueprintGrid(boundary);
    }
    if (game.board.full) {
      const top = clamp(horizon, r.top, r.bottom);
      ctx.fillStyle = this.fullPattern; ctx.fillRect(r.left, top, width, r.bottom - top);
    }
    const bounds = c.bounds();
    for (const key of game.board.differences) {
      const [x, y] = pointOf(key);
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      const [px, py] = c.screen(x, y);
      if (game.board.full && y <= 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(px - s / 2, py - s / 2, s, s); ctx.clip();
        this.checkerRect(px - s / 2, py - s / 2, s, s);
        if (x === 0) { ctx.fillStyle = '#b75f6240'; ctx.fillRect(px - s / 2, py - s / 2, s, s); }
        if (y === 0) { ctx.fillStyle = '#527a5959'; ctx.fillRect(px - s / 2, py - s / 2, s, s); }
        if (game.mode === 'blueprint') { ctx.fillStyle = '#6e9eae30'; ctx.fillRect(px - s / 2, py - s / 2, s, s); }
        ctx.restore();
      } else ctx.drawImage(this.piece, px - s / 2, py - s / 2, s, s);
    }
    // The starting frontier is above the cell centers of y = 0.
    if (horizon > r.top && horizon < r.bottom) {
      ctx.beginPath(); ctx.moveTo(r.left, horizon); ctx.lineTo(r.right, horizon);
      ctx.strokeStyle = '#395e4f80'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.hover && game.mode === 'blueprint' && this.hover[1] <= 0) this.outline(this.hover, '#396a7899', false);
    if (game.selected) {
      this.outline(game.selected, '#fff6cb', true);
      for (const point of game.board.movesFrom(...game.selected)) {
        const [px, py] = c.screen(...point);
        ctx.fillStyle = '#fff1ad65'; ctx.fillRect(px - s / 2, py - s / 2, s, s);
        ctx.beginPath(); ctx.arc(px, py, Math.max(2, s * .15), 0, 2 * Math.PI); ctx.fillStyle = '#39745e'; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, s * .3, 0, 2 * Math.PI); ctx.strokeStyle = '#faffdf'; ctx.lineWidth = Math.max(1.5, s * .035); ctx.stroke();
      }
    }
    if (this.cursor) this.outline(this.cursor, '#155d85', false);
    this.fadeEdges(r, Math.min(40, width * .1, height * .12));
    ctx.restore();
    this.labels();
  }
  blueprintGrid(boundary) {
    const ctx = this.ctx, c = this.camera, r = c.rect, b = c.bounds(), s = c.cell;
    if (s < 17 || boundary >= r.bottom) return;
    ctx.save(); ctx.beginPath(); ctx.rect(r.left, boundary, r.right - r.left, r.bottom - boundary); ctx.clip();
    ctx.strokeStyle = '#426f791e'; ctx.lineWidth = .7; ctx.beginPath();
    for (let x = b.minX; x <= b.maxX; x++) {
      const px = c.screen(x - .5, 0)[0]; ctx.moveTo(px, boundary); ctx.lineTo(px, r.bottom);
    }
    for (let y = b.minY; y <= Math.min(0, b.maxY); y++) {
      const py = c.screen(0, y + .5)[1]; ctx.moveTo(r.left, py); ctx.lineTo(r.right, py);
    }
    ctx.stroke(); ctx.restore();
  }
  outline(point, color, round) {
    const ctx = this.ctx, s = this.camera.cell, [x, y] = this.camera.screen(...point);
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, Math.min(3, s * .045));
    if (round) { ctx.beginPath(); ctx.arc(x, y, s * .405, 0, 2 * Math.PI); ctx.stroke(); }
    else ctx.strokeRect(x - s * .46, y - s * .46, s * .92, s * .92);
  }
  fadeEdges(r, depth) {
    const ctx = this.ctx;
    const bands = [
      [r.left, r.top, r.left + depth, r.top, r.left, r.top, depth, r.bottom - r.top],
      [r.right, r.top, r.right - depth, r.top, r.right - depth, r.top, depth, r.bottom - r.top],
      [r.left, r.top, r.left, r.top + depth, r.left, r.top, r.right - r.left, depth],
      [r.left, r.bottom, r.left, r.bottom - depth, r.left, r.bottom - depth, r.right - r.left, depth],
    ];
    for (const [x0, y0, x1, y1, x, y, w, h] of bands) {
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, PAPER); gradient.addColorStop(.25, '#f3eee4ce'); gradient.addColorStop(1, '#f3eee400');
      ctx.fillStyle = gradient; ctx.fillRect(x, y, w, h);
    }
  }
  labels() {
    const ctx = this.ctx, c = this.camera, r = c.rect, b = c.bounds();
    ctx.font = `11px ${FONT}`; ctx.textBaseline = 'middle';
    const longestX = Math.max(...[b.minX, b.maxX].map(n => ctx.measureText(`x=${n}`).width));
    const stepX = labelStep((longestX + 17) / c.cell), stepY = labelStep(25 / c.cell);
    ctx.textAlign = 'center';
    for (let x = Math.ceil(b.minX / stepX) * stepX; x <= b.maxX; x += stepX) {
      const px = c.screen(x, 0)[0], half = ctx.measureText(`x=${x}`).width / 2;
      if (px < r.left + half || px > r.right - half) continue;
      ctx.fillStyle = x === 0 ? '#a55859' : '#7f7e6e';
      ctx.fillText(`x=${x}`, px, r.bottom + 17);
    }
    ctx.textAlign = 'right';
    for (let y = Math.ceil(b.minY / stepY) * stepY; y <= b.maxY; y += stepY) {
      const py = c.screen(0, y)[1];
      if (py < r.top + 8 || py > r.bottom - 8) continue;
      ctx.fillStyle = y === 0 ? '#3f7456' : '#7f7e6e';
      // Long labels are scaled inside their gutter, never hidden beyond the viewport.
      ctx.fillText(`y=${y}`, r.left - 9, py, r.left - 13);
    }
  }
}

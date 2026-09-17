export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 5;
const CAMERA_LIMIT = 1e9;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function labelStep(minimum) {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, minimum)));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= minimum) return factor * power;
  return power * 10;
}

export class Camera {
  constructor() {
    this.width = 1; this.height = 1;
    this.rect = { left: 44, top: 90, right: 300, bottom: 500 };
    this.center = [0, 0]; this.zoom = 1; this.baseCell = 56;
  }
  get cell() { return this.baseCell * this.zoom; }
  get midpoint() { return [(this.rect.left + this.rect.right) / 2, (this.rect.top + this.rect.bottom) / 2]; }
  resize(width, height, insets = {}) {
    this.width = width; this.height = height;
    const small = width <= 640;
    const { top = 0, bottom = 0, left = 0, right = 0 } = insets;
    this.rect = {
      left: Math.max(small ? 47 : 64, left + 38),
      right: width - Math.max(small ? 13 : 27, right + 10),
      top: (small ? 115 : 100) + top,
      bottom: height - (small || width <= 900 ? 125 : 102) - bottom,
    };
    if (height <= 480) { this.rect.top = 85 + top; this.rect.bottom = height - 85 - bottom; }
    this.rect.bottom = Math.max(this.rect.top + 30, this.rect.bottom);
    this.baseCell = Math.min(64, Math.max(38, (width - 60) / 7));
  }
  home() { this.center = [0, 0]; this.zoom = 1; }
  screen(x, y) {
    const [mx, my] = this.midpoint;
    return [mx + (x - this.center[0]) * this.cell, my - (y - this.center[1]) * this.cell];
  }
  world(px, py) {
    const [mx, my] = this.midpoint;
    return [this.center[0] + (px - mx) / this.cell, this.center[1] - (py - my) / this.cell];
  }
  hit(px, py) { return this.world(px, py).map(value => Math.floor(value + 0.5)); }
  inside(px, py) {
    const r = this.rect;
    return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }
  get originVisible() { return this.inside(...this.screen(0, 0)); }
  constrain() { this.center = this.center.map(value => clamp(value, -CAMERA_LIMIT, CAMERA_LIMIT)); }
  pan(dx, dy) {
    this.center[0] -= dx / this.cell; this.center[1] += dy / this.cell; this.constrain();
  }
  zoomAt(factor, px, py) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = this.world(px, py);
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.world(px, py);
    this.center[0] += before[0] - after[0]; this.center[1] += before[1] - after[1];
    this.constrain();
  }
  bounds() {
    const tl = this.world(this.rect.left, this.rect.top), br = this.world(this.rect.right, this.rect.bottom);
    return { minX: Math.ceil(tl[0] - .5), maxX: Math.floor(br[0] + .5), minY: Math.ceil(br[1] - .5), maxY: Math.floor(tl[1] + .5) };
  }
}

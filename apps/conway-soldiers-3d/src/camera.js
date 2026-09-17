export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 3;
export const MIN_PLANE_SCALE = 0.45;
export const CAMERA_LIMIT = 1e6;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const DEFAULT_YAW = 0.43, DEFAULT_PITCH = 0.27;

export function labelStep(minimum) {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, minimum)));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= minimum) return factor * power;
  return power * 10;
}

// The orbit belongs to world space, independently of the editable XZ or XY
// plane. In particular, switching planes must not move the camera's target.
export class Camera {
  constructor() {
    this.width = 1; this.height = 1; this.baseCell = 48;
    this._plane = 'XZ'; this.target = [0, 0, 2]; this.slice = 0; this.depth = 1;
    this.zoom = 1; this.yaw = DEFAULT_YAW; this.pitch = DEFAULT_PITCH;
    this.rect = { left: 0, top: 0, right: 1, bottom: 1 };
  }
  get plane() { return this._plane; }
  get normalAxis() { return this.plane === 'XY' ? 2 : 1; }
  get verticalAxis() { return this.plane === 'XY' ? 1 : 2; }
  get normalLabel() { return this.plane === 'XY' ? 'Z' : 'Y'; }
  get verticalLabel() { return this.plane === 'XY' ? 'Y' : 'Z'; }
  get target() { return this._target; }
  set target(value) { this._target = [0, 1, 2].map(i => clamp(finite(value?.[i]), -CAMERA_LIMIT, CAMERA_LIMIT)); }
  get center() { return [this.target[0], this.target[this.verticalAxis]]; }
  set center(value) {
    const target = [...this.target];
    target[0] = value?.[0]; target[this.verticalAxis] = value?.[1];
    this.target = target;
  }
  get slice() { return this._slice; }
  set slice(value) {
    this._slice = clamp(Math.round(finite(value)), -CAMERA_LIMIT, CAMERA_LIMIT);
    this.target[this.normalAxis] = this._slice;
  }
  get depth() { return this._depth; }
  set depth(value) { this._depth = clamp(Math.round(finite(value, 1)), 0, 2); }
  get zoom() { return this._zoom; }
  set zoom(value) { this._zoom = clamp(finite(value, 1), MIN_ZOOM, MAX_ZOOM); }
  get yaw() { return this._yaw; }
  set yaw(value) { this._yaw = finite(value, DEFAULT_YAW); }
  get pitch() { return this._pitch; }
  set pitch(value) { this._pitch = clamp(finite(value, DEFAULT_PITCH), -Math.PI / 2, Math.PI / 2); }
  get cell() { return this.baseCell * this.zoom; }
  get midpoint() { return [this.width / 2, this.height / 2]; }
  // The smallest singular value equals the absolute plane determinant.
  // Keep it just above the largest sphere diameter (.448 cell), allowing a
  // shallower view while inverse-plane rounding still distinguishes pieces.
  get normalDepth() { return this.plane === 'XY' ? Math.sin(this.pitch) : Math.cos(this.yaw) * Math.cos(this.pitch); }
  get pickable() { return Math.abs(this.normalDepth) > MIN_PLANE_SCALE; }
  get originVisible() { return this.inside(...this.screen(...this.point(0, 0))); }
  point(x, vertical, slice = this.slice) { return this.plane === 'XY' ? [x, vertical, slice] : [x, slice, vertical]; }
  setPlane(plane, anchor = null) {
    if (!['XZ', 'XY'].includes(plane) || plane === this.plane) return false;
    this._plane = plane;
    // Bypass the slice setter: rounding the new plane coordinate must not
    // round the target, nor pull an off-centre selection into the viewport.
    this._slice = clamp(Math.round(finite(anchor?.[this.normalAxis], this.target[this.normalAxis])), -CAMERA_LIMIT, CAMERA_LIMIT);
    return true;
  }
  resize(width, height) {
    this.width = Math.max(1, finite(width, 1)); this.height = Math.max(1, finite(height, 1));
    const margin = this.width < 500 ? 14 : 28;
    this.rect = { left: margin, top: 28, right: Math.max(margin + 1, this.width - margin), bottom: Math.max(29, this.height - 28) };
    // On phones, show fewer sites instead of shrinking the targets to fit the
    // entire board. The origin and seventh-layer rail still fit usual stages;
    // shorter stages can be panned or pinched without sacrificing tap precision.
    this.baseCell = this.width < 500
      ? clamp(Math.min((this.width - 40) / 8.5, (this.height - 40) / 10.7), 30, 36)
      : clamp(Math.min((this.width - 50) / 11.5, (this.height - 50) / 12.7), 24, 62);
  }
  home() {
    this.target = this.plane === 'XY' ? [0, 0, 0] : [0, 0, 2]; this.slice = 0; this.zoom = 1;
    this.yaw = DEFAULT_YAW; this.pitch = this.plane === 'XY' ? -Math.PI / 2 + DEFAULT_PITCH : DEFAULT_PITCH;
  }
  face() { this.yaw = 0; this.pitch = this.plane === 'XY' ? -Math.PI / 2 : 0; }
  orbit(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.yaw = ((this.yaw + dx * 0.006 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.pitch += dy * 0.0045;
  }
  screen(x, y, z) {
    const [mx, my] = this.midpoint, s = this.cell;
    const dx = x - this.target[0], dy = y - this.target[1], dz = z - this.target[2];
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return [mx + s * (cy * dx - sy * dy), my + s * (sp * sy * dx + sp * cy * dy - cp * dz),
      s * (cp * sy * dx + cp * cy * dy + sp * dz)];
  }
  world(px, py, slice = this.slice) {
    if (!this.pickable || ![px, py, slice].every(Number.isFinite)) return null;
    const [mx, my] = this.midpoint, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    const horizontal = [cy, -sy, 0], vertical = [sp * sy, sp * cy, -cp];
    const n = this.normalAxis, v = this.verticalAxis, normal = slice - this.target[n];
    const sx = (px - mx) / this.cell - horizontal[n] * normal;
    const syScreen = (py - my) / this.cell - vertical[n] * normal;
    const determinant = horizontal[0] * vertical[v] - horizontal[v] * vertical[0];
    const dx = (sx * vertical[v] - horizontal[v] * syScreen) / determinant;
    const dv = (horizontal[0] * syScreen - sx * vertical[0]) / determinant;
    const result = this.point(this.target[0] + dx, this.target[v] + dv, slice);
    return result.every(Number.isFinite) ? result : null;
  }
  hit(px, py) {
    const point = this.world(px, py);
    if (!point) return null;
    const result = this.point(Math.round(point[0]), Math.round(point[this.verticalAxis]));
    return this.inBounds(result) ? result.map(value => value === 0 ? 0 : value) : null;
  }
  inBounds(point, b = this.bounds()) {
    return Array.isArray(point) && point.length === 3 && point.every((value, axis) => {
      const label = 'XYZ'[axis];
      return Number.isFinite(value) && Math.abs(value) <= CAMERA_LIMIT && value >= b[`min${label}`] && value <= b[`max${label}`];
    });
  }
  inside(px, py) {
    const r = this.rect;
    return Number.isFinite(px) && Number.isFinite(py) && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }
  constrain() { this.target = this.target; }
  shiftOnScreen(dx, dy) {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // The two projection rows are orthonormal. Their transpose moves the
    // target along the screen without dividing by a near-zero plane angle.
    this.target = [this.target[0] + cy * dx + sp * sy * dy,
      this.target[1] - sy * dx + sp * cy * dy, this.target[2] - cp * dy];
  }
  pan(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (this.pickable) {
      const a = this.world(...this.midpoint), b = this.world(this.midpoint[0] + dx, this.midpoint[1] + dy);
      this.center = [this.center[0] - b[0] + a[0], this.center[1] - b[this.verticalAxis] + a[this.verticalAxis]];
    } else {
      this.shiftOnScreen(-dx / this.cell, -dy / this.cell);
    }
  }
  zoomAt(factor, px, py) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = this.world(px, py);
    const oldCell = this.cell;
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const after = this.world(px, py);
    if (before && after) this.center = [this.center[0] + before[0] - after[0], this.center[1] + before[this.verticalAxis] - after[this.verticalAxis]];
    else if (Number.isFinite(px) && Number.isFinite(py)) {
      const [mx, my] = this.midpoint, scale = 1 / oldCell - 1 / this.cell;
      this.shiftOnScreen((px - mx) * scale, (py - my) * scale);
    }
  }
  bounds() {
    const r = this.rect;
    // Frame the finite working window using the default orientation. Rotating
    // changes only its projection, never its in-plane extent; entering
    // the side-view picking guard must not replace the window with a smaller one.
    // Pan, zoom and viewport size still determine which coordinates are sampled.
    const [mx, my] = this.midpoint;
    const cy = Math.cos(DEFAULT_YAW), sy = Math.sin(DEFAULT_YAW);
    const cp = Math.cos(DEFAULT_PITCH), sp = Math.sin(DEFAULT_PITCH);
    const corners = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([px, py]) => {
      const sx = (px - mx) / this.cell, syScreen = (py - my) / this.cell;
      if (this.plane === 'XY') return [this.center[0] + cy * sx - sy * syScreen / cp,
        this.center[1] - sy * sx - cy * syScreen / cp];
      const dx = sx / cy, dv = (sp * sy * dx - syScreen) / cp;
      return [this.center[0] + dx, this.center[1] + dv];
    });
    const xs = corners.map(p => p[0]), vs = corners.map(p => p[1]);
    const cx = Math.round(this.center[0]), cv = Math.round(this.center[1]);
    const minX = clamp(Math.floor(Math.min(...xs)) - 1, cx - 15, cx + 15);
    const maxX = clamp(Math.ceil(Math.max(...xs)) + 1, cx - 15, cx + 15);
    const minV = clamp(Math.floor(Math.min(...vs)) - 1, cv - 15, cv + 15);
    const maxV = clamp(Math.ceil(Math.max(...vs)) + 1, cv - 15, cv + 15);
    const b = { minX: Math.max(-CAMERA_LIMIT, minX), maxX: Math.min(CAMERA_LIMIT, maxX),
      minY: this.slice, maxY: this.slice, minZ: this.slice, maxZ: this.slice };
    b[`min${this.verticalLabel}`] = Math.max(-CAMERA_LIMIT, minV);
    b[`max${this.verticalLabel}`] = Math.min(CAMERA_LIMIT, maxV);
    return b;
  }
}

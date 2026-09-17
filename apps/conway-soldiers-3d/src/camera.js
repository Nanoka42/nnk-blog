export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 3;
export const CAMERA_LIMIT = 1e6;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const DEFAULT_YAW = 0.43, DEFAULT_PITCH = 0.27;

export function labelStep(minimum) {
  const power = 10 ** Math.floor(Math.log10(Math.max(1, minimum)));
  for (const factor of [1, 2, 5, 10]) if (factor * power >= minimum) return factor * power;
  return power * 10;
}

// An orthographic orbit camera. The editable plane is always Y = slice;
// depth changes its context, never the plane on which a click is resolved.
export class Camera {
  constructor() {
    this.width = 1; this.height = 1; this.baseCell = 48;
    this.center = [0, 2]; this.slice = 0; this.depth = 1;
    this.zoom = 1; this.yaw = DEFAULT_YAW; this.pitch = DEFAULT_PITCH;
    this.rect = { left: 0, top: 0, right: 1, bottom: 1 };
  }
  get center() { return this._center; }
  set center(value) { this._center = [0, 1].map(i => clamp(finite(value?.[i]), -CAMERA_LIMIT, CAMERA_LIMIT)); }
  get slice() { return this._slice; }
  set slice(value) { this._slice = clamp(Math.round(finite(value)), -CAMERA_LIMIT, CAMERA_LIMIT); }
  get depth() { return this._depth; }
  set depth(value) { this._depth = clamp(Math.round(finite(value, 1)), 0, 2); }
  get zoom() { return this._zoom; }
  set zoom(value) { this._zoom = clamp(finite(value, 1), MIN_ZOOM, MAX_ZOOM); }
  get cell() { return this.baseCell * this.zoom; }
  get midpoint() { return [this.width / 2, this.height / 2]; }
  // The smallest singular value of the plane projection is |cos(yaw)cos(pitch)|.
  // Keeping it above .5 prevents adjacent sphere silhouettes from overlapping
  // and makes inverse-plane rounding a reliable, unambiguous pick operation.
  get pickable() { return Math.abs(Math.cos(this.yaw) * Math.cos(this.pitch)) > 0.5; }
  get originVisible() { return this.inside(...this.screen(0, this.slice, 0)); }
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
    this.center = [0, 2]; this.slice = 0; this.zoom = 1;
    this.yaw = DEFAULT_YAW; this.pitch = DEFAULT_PITCH;
  }
  face() { this.yaw = 0; this.pitch = 0; }
  orbit(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.yaw = ((this.yaw + dx * 0.006 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.pitch = clamp(this.pitch + dy * 0.0045, -0.85, 0.85);
  }
  screen(x, y, z) {
    const [mx, my] = this.midpoint, s = this.cell;
    const dx = x - this.center[0], dy = y - this.slice, dz = z - this.center[1];
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return [mx + s * (cy * dx - sy * dy), my + s * (sp * sy * dx + sp * cy * dy - cp * dz),
      s * (cp * sy * dx + cp * cy * dy + sp * dz)];
  }
  world(px, py) {
    if (!this.pickable || !Number.isFinite(px) || !Number.isFinite(py)) return null;
    const [mx, my] = this.midpoint, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dx = (px - mx) / (this.cell * cy);
    const dz = (Math.sin(this.pitch) * sy * dx - (py - my) / this.cell) / Math.cos(this.pitch);
    return [this.center[0] + dx, this.slice, this.center[1] + dz];
  }
  hit(px, py) {
    const point = this.world(px, py);
    if (!point) return null;
    const result = [Math.round(point[0]), this.slice, Math.round(point[2])];
    const b = this.bounds();
    if (result[0] < b.minX || result[0] > b.maxX || result[2] < b.minZ || result[2] > b.maxZ) return null;
    return result.every(value => Math.abs(value) <= CAMERA_LIMIT) ? result.map(value => value === 0 ? 0 : value) : null;
  }
  inside(px, py) {
    const r = this.rect;
    return Number.isFinite(px) && Number.isFinite(py) && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  }
  constrain() { this.center = this.center; }
  pan(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (this.pickable) {
      const a = this.world(...this.midpoint), b = this.world(this.midpoint[0] + dx, this.midpoint[1] + dy);
      this.center = [this.center[0] - b[0] + a[0], this.center[1] - b[2] + a[2]];
    } else {
      // Keep vertical navigation stable while the plane is too narrow to edit.
      this.center = [this.center[0], this.center[1] + dy / (this.cell * Math.cos(this.pitch))];
    }
  }
  zoomAt(factor, px, py) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const before = this.world(px, py);
    this.zoom *= factor;
    const after = this.world(px, py);
    if (before && after) this.center = [this.center[0] + before[0] - after[0], this.center[1] + before[2] - after[2]];
  }
  bounds() {
    const r = this.rect;
    // Frame the finite working window using the default orientation. Rotating
    // changes only its projection, never its X/Z extent; in particular, entering
    // the side-view picking guard must not replace the window with a smaller one.
    // Pan, zoom and viewport size still determine which coordinates are sampled.
    const [mx, my] = this.midpoint;
    const cy = Math.cos(DEFAULT_YAW), sy = Math.sin(DEFAULT_YAW);
    const cp = Math.cos(DEFAULT_PITCH), sp = Math.sin(DEFAULT_PITCH);
    const corners = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([px, py]) => {
      const dx = (px - mx) / (this.cell * cy);
      const dz = (sp * sy * dx - (py - my) / this.cell) / cp;
      return [this.center[0] + dx, this.center[1] + dz];
    });
    const xs = corners.map(p => p[0]), zs = corners.map(p => p[1]);
    const cx = Math.round(this.center[0]), cz = Math.round(this.center[1]);
    const minX = clamp(Math.floor(Math.min(...xs)) - 1, cx - 15, cx + 15);
    const maxX = clamp(Math.ceil(Math.max(...xs)) + 1, cx - 15, cx + 15);
    const minZ = clamp(Math.floor(Math.min(...zs)) - 1, cz - 15, cz + 15);
    const maxZ = clamp(Math.ceil(Math.max(...zs)) + 1, cz - 15, cz + 15);
    return { minX: Math.max(-CAMERA_LIMIT, minX), maxX: Math.min(CAMERA_LIMIT, maxX),
      minZ: Math.max(-CAMERA_LIMIT, minZ), maxZ: Math.min(CAMERA_LIMIT, maxZ) };
  }
}

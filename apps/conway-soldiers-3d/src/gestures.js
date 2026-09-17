// Pointer intent is decided once the drag threshold is crossed. A multi-touch
// sequence remains in navigation mode until every finger has been released.
export class BoardGesture {
  constructor(camera, { change = () => {}, tap = () => {}, drag = () => {}, mode = () => 'orbit', pick = (x, y) => camera.hit(x, y) } = {}) {
    this.camera = camera; this.change = change; this.tap = tap; this.drag = drag; this.mode = mode;
    this.pick = pick;
    this.pointers = new Map(); this.dragging = false; this.suppressTap = false;
  }
  down(id, x, y, pointerType = 'mouse', button = 0, shiftKey = false) {
    this.pointers.set(id, { x, y, startX: x, startY: y, threshold: pointerType === 'mouse' ? 5 : 9,
      canTap: button === 0 && !shiftKey, mode: button === 2 ? 'orbit' : (shiftKey || button === 1 ? 'pan' : this.mode()) });
    if (button !== 0) this.suppressTap = true;
    if (this.pointers.size > 1) {
      this.suppressTap = true; this.setDragging(true);
      // A finger lifting at the end of a pinch must not abruptly orbit the view.
      for (const pointer of this.pointers.values()) pointer.mode = 'pan';
    }
  }
  setDragging(value) { if (this.dragging !== value) { this.dragging = value; this.drag(value); } }
  pair() {
    const [a, b] = [...this.pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  move(id, x, y) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    const before = this.pointers.size > 1 ? this.pair() : null;
    const previous = { x: pointer.x, y: pointer.y };
    pointer.x = x; pointer.y = y;
    if (before) {
      const after = this.pair();
      if (before.distance > 2 && after.distance > 2) this.camera.zoomAt(after.distance / before.distance, before.x, before.y);
      this.camera.pan(after.x - before.x, after.y - before.y);
      this.change(); return;
    }
    const distance = Math.hypot(x - pointer.startX, y - pointer.startY);
    if (!this.dragging && distance <= pointer.threshold) return;
    const from = this.dragging ? previous : { x: pointer.startX, y: pointer.startY };
    this.suppressTap = true; this.setDragging(true);
    if (pointer.mode === 'pan') this.camera.pan(x - from.x, y - from.y);
    else this.camera.orbit(x - from.x, y - from.y);
    this.change();
  }
  up(id, x, y, canceled = false) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    const isTap = !canceled && pointer.canTap && !this.suppressTap && !this.dragging &&
      Math.hypot(x - pointer.startX, y - pointer.startY) <= pointer.threshold;
    this.pointers.delete(id);
    if (this.pointers.size === 0) { this.suppressTap = false; this.setDragging(false); }
    if (isTap && this.camera.inside(x, y)) {
      const hit = this.pick(x, y);
      if (hit) this.tap(...hit);
    }
  }
  cancel() { this.pointers.clear(); this.suppressTap = false; this.setDragging(false); }
}

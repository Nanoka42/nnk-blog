// A pinch must never become a tap when one finger lifts.
export class BoardGesture {
  constructor(camera, { change, tap, drag = () => {} }) {
    this.camera = camera; this.change = change; this.tap = tap; this.drag = drag;
    this.pointers = new Map(); this.dragging = false; this.suppressTap = false;
  }
  down(id, x, y, pointerType = 'mouse') {
    this.pointers.set(id, { x, y, startX: x, startY: y, threshold: pointerType === 'mouse' ? 5 : 9 });
    if (this.pointers.size > 1) { this.suppressTap = true; this.dragging = true; this.drag(true); }
  }
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
    this.dragging = true; this.suppressTap = true; this.drag(true);
    this.camera.pan(x - from.x, y - from.y); this.change();
  }
  up(id, x, y, canceled = false) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    const isTap = !canceled && !this.suppressTap && !this.dragging &&
      Math.hypot(x - pointer.startX, y - pointer.startY) <= pointer.threshold;
    this.pointers.delete(id);
    if (this.pointers.size === 0) { this.suppressTap = false; this.dragging = false; this.drag(false); }
    if (isTap && this.camera.inside(x, y)) this.tap(...this.camera.hit(x, y));
  }
  cancel() { this.pointers.clear(); this.suppressTap = false; this.dragging = false; this.drag(false); }
}

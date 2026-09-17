export const DIRECTIONS = Object.freeze([[0, 2], [2, 0], [0, -2], [-2, 0]].map(Object.freeze));
export const keyOf = (x, y) => `${x},${y}`;
export const pointOf = key => key.split(',').map(Number);
// Leave headroom for midpoint/destination arithmetic; the camera uses a smaller range.
export const isCoordinate = n => Number.isSafeInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER - 4;

export class Board {
  constructor(full = false, differences = []) {
    this.full = Boolean(full);
    this.differences = new Set(differences);
  }
  clone() { return new Board(this.full, this.differences); }
  has(x, y) {
    if (!isCoordinate(x) || !isCoordinate(y)) return false;
    return (this.full && y <= 0) !== this.differences.has(keyOf(x, y));
  }
  toggle(x, y) {
    if (!isCoordinate(x) || !isCoordinate(y)) return false;
    const key = keyOf(x, y);
    if (!this.differences.delete(key)) this.differences.add(key);
    return true;
  }
  canMove(from, to) {
    if (![...from, ...to].every(isCoordinate)) return false;
    const dx = to[0] - from[0], dy = to[1] - from[1];
    return ((Math.abs(dx) === 2 && dy === 0) || (Math.abs(dy) === 2 && dx === 0)) &&
      this.has(...from) && this.has(from[0] + dx / 2, from[1] + dy / 2) && !this.has(...to);
  }
  movesFrom(x, y) {
    if (!this.has(x, y)) return [];
    return DIRECTIONS.map(([dx, dy]) => [x + dx, y + dy]).filter(to => this.canMove([x, y], to));
  }
  flipMove(from, to) {
    this.toggle(...from);
    this.toggle((from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
    this.toggle(...to);
  }
  stats() {
    let holes = 0, advanced = 0, highest = null;
    for (const key of this.differences) {
      const [, y] = pointOf(key);
      if (this.full && y <= 0) holes++;
      else {
        if (y > 0) advanced++;
        highest = highest === null ? y : Math.max(highest, y);
      }
    }
    if (this.full) highest = Math.max(0, highest ?? 0);
    return { pieces: this.full ? Infinity : this.differences.size, holes, advanced, highest };
  }
}

export class Game {
  constructor() {
    this.board = new Board();
    this.mode = 'blueprint';
    this.initial = null;
    this.history = [];
    this.selected = null;
    this.peak = 0;
  }
  get steps() { return this.history.length; }
  get needsLayoutConfirmation() { return this.board.differences.size > 0; }
  setBaseline(full) {
    if (this.mode !== 'blueprint') return false;
    this.board = new Board(full);
    this.selected = null;
    return true;
  }
  start() {
    if (this.mode !== 'blueprint' || (!this.board.full && this.board.differences.size === 0)) return false;
    this.initial = this.board.clone();
    this.mode = 'play';
    this.history = [];
    this.selected = null;
    this.peak = 0;
    return true;
  }
  restore(mode) {
    if (!this.initial || !['blueprint', 'play'].includes(mode)) return false;
    this.board = this.initial.clone();
    this.mode = mode;
    this.history = [];
    this.selected = null;
    this.peak = 0;
    return true;
  }
  move(from, to) {
    if (this.mode !== 'play' || !this.board.canMove(from, to)) return false;
    this.history.push({ from: [...from], to: [...to], peak: this.peak });
    this.board.flipMove(from, to);
    this.peak = Math.max(this.peak, to[1]);
    this.selected = null;
    return true;
  }
  undo() {
    if (this.mode !== 'play' || !this.history.length) return false;
    const move = this.history.pop();
    this.board.flipMove(move.from, move.to);
    this.peak = move.peak;
    this.selected = null;
    return true;
  }
  click(x, y) {
    if (!isCoordinate(x) || !isCoordinate(y)) return 'invalid';
    if (this.mode === 'blueprint') {
      if (y > 0) return 'locked';
      this.board.toggle(x, y);
      return 'edit';
    }
    if (this.selected && this.move(this.selected, [x, y])) return 'move';
    if (this.selected?.[0] === x && this.selected?.[1] === y) {
      this.selected = null;
      return 'deselect';
    }
    this.selected = this.board.has(x, y) ? [x, y] : null;
    return this.selected ? 'select' : 'deselect';
  }
}

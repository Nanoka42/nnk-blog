// World coordinates use +Z as height; the placement half-space is z <= 0.
export const DIRECTIONS = Object.freeze([
  [0, 0, 2], [2, 0, 0], [0, 2, 0],
  [0, 0, -2], [-2, 0, 0], [0, -2, 0],
].map(Object.freeze));

// Keep enough exact-integer headroom for jump and midpoint arithmetic.
export const isCoordinate = n => Number.isSafeInteger(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER - 4;
const isPoint = point => Array.isArray(point) && point.length === 3 &&
  isCoordinate(point[0]) && isCoordinate(point[1]) && isCoordinate(point[2]);

export const keyOf = (x, y, z) => {
  if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(z)) {
    throw new TypeError('A board key needs three safe integer coordinates.');
  }
  return `${x},${y},${z}`;
};

export const pointOf = key => {
  if (typeof key !== 'string') return null;
  const parts = key.split(',');
  if (parts.length !== 3 || parts.some(part => !/^-?\d+$/.test(part))) return null;
  const point = parts.map(Number);
  return isPoint(point) && keyOf(...point) === key ? point : null;
};

const midpointOfJump = (from, to) => {
  if (!isPoint(from) || !isPoint(to)) return null;
  const delta = to.map((n, axis) => n - from[axis]);
  if (!DIRECTIONS.some(direction => direction.every((n, axis) => n === delta[axis]))) return null;
  // Avoid (from + to) / 2: its intermediate sum could exceed the safe range.
  return from.map((n, axis) => n + delta[axis] / 2);
};

export class Board {
  constructor(full = false, differences = []) {
    if (differences == null || typeof differences === 'string' ||
        typeof differences[Symbol.iterator] !== 'function') {
      throw new TypeError('Board differences must be an iterable of three-dimensional keys.');
    }
    const entries = [...differences];
    if (entries.some(key => pointOf(key) === null)) {
      throw new TypeError('Board differences contain an invalid three-dimensional key.');
    }
    this.full = Boolean(full);
    // full is an infinite baseline, with only finite exceptions stored in memory.
    this.differences = new Set(entries);
  }

  clone() { return new Board(this.full, this.differences); }

  has(x, y, z) {
    if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(z)) return false;
    return (this.full && z <= 0) !== this.differences.has(keyOf(x, y, z));
  }

  toggle(x, y, z) {
    if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(z)) return false;
    const key = keyOf(x, y, z);
    if (!this.differences.delete(key)) this.differences.add(key);
    return true;
  }

  canMove(from, to) {
    const middle = midpointOfJump(from, to);
    return middle !== null && this.has(...from) && this.has(...middle) && !this.has(...to);
  }

  movesFrom(x, y, z) {
    if (!this.has(x, y, z)) return [];
    const from = [x, y, z];
    return DIRECTIONS.map(direction => from.map((n, axis) => n + direction[axis]))
      .filter(to => this.canMove(from, to));
  }

  // Toggling the same three cells implements both a move and its inverse.
  // Validate the entire operation before touching any cell.
  flipMove(from, to) {
    const middle = midpointOfJump(from, to);
    if (middle === null) return false;
    const start = this.has(...from), jumped = this.has(...middle), end = this.has(...to);
    if (!((start && jumped && !end) || (!start && !jumped && end))) return false;
    this.toggle(...from);
    this.toggle(...middle);
    this.toggle(...to);
    return true;
  }

  stats() {
    let holes = 0, advanced = 0, highest = null;
    for (const key of this.differences) {
      const point = pointOf(key);
      if (!point) throw new TypeError('Board differences contain an invalid three-dimensional key.');
      const z = point[2];
      if (this.full && z <= 0) holes++;
      else {
        if (z > 0) advanced++;
        highest = highest === null ? z : Math.max(highest, z);
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
    // A caller cannot bypass placement restrictions by injecting an advanced piece.
    for (const key of this.board.differences) {
      const point = pointOf(key);
      if (!point || point[2] > 0) return false;
    }
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
    const entry = { from: [...from], to: [...to], peak: this.peak };
    if (!this.board.flipMove(entry.from, entry.to)) return false;
    this.history.push(entry);
    this.peak = Math.max(this.peak, to[2]);
    this.selected = null;
    return true;
  }

  undo() {
    if (this.mode !== 'play' || !this.history.length) return false;
    const entry = this.history[this.history.length - 1];
    if (!this.board.flipMove(entry.from, entry.to)) return false;
    this.history.pop();
    this.peak = entry.peak;
    this.selected = null;
    return true;
  }

  click(x, y, z) {
    if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(z)) return 'invalid';
    if (this.mode === 'blueprint') {
      if (z > 0) return 'locked';
      this.board.toggle(x, y, z);
      return 'edit';
    }
    if (this.mode !== 'play') return 'invalid';
    if (this.selected && this.move(this.selected, [x, y, z])) return 'move';
    if (this.selected?.[0] === x && this.selected?.[1] === y && this.selected?.[2] === z) {
      this.selected = null;
      return 'deselect';
    }
    this.selected = this.board.has(x, y, z) ? [x, y, z] : null;
    return this.selected ? 'select' : 'deselect';
  }
}

// An introductory construction, not a seven-layer solution: four jumps use
// all three spatial axes and turn five initial pieces into one at z = 2.
export const DEMO_CELLS = Object.freeze([
  [0, 0, -1], [0, 0, 0], [0, 1, 0], [1, 2, 0], [2, 2, 0],
].map(Object.freeze));
export const DEMO_MOVES = Object.freeze([
  { from: [0, 0, -1], to: [0, 0, 1] },
  { from: [2, 2, 0], to: [0, 2, 0] },
  { from: [0, 2, 0], to: [0, 0, 0] },
  { from: [0, 0, 0], to: [0, 0, 2] },
].map(move => Object.freeze({ from: Object.freeze(move.from), to: Object.freeze(move.to) })));

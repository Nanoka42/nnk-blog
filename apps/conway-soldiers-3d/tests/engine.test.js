import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, Game, keyOf, pointOf, isCoordinate, DIRECTIONS, DEMO_CELLS, DEMO_MOVES } from '../src/engine.js';

const arranged = cells => {
  const game = new Game();
  for (const point of cells) assert.equal(game.click(...point), 'edit');
  assert.equal(game.start(), true);
  return game;
};
const snapshot = game => ({
  differences: new Set(game.board.differences), steps: game.steps,
  peak: game.peak, selected: game.selected && [...game.selected], mode: game.mode,
});

test('keys are exactly three-dimensional safe integer coordinates', () => {
  assert.deepEqual(pointOf(keyOf(-3, 8, -1)), [-3, 8, -1]);
  assert.equal(keyOf(-0, 0, 0), '0,0,0');
  for (const invalid of [NaN, Infinity, -Infinity, 0.5, '0', undefined, null, Number.MAX_SAFE_INTEGER]) {
    assert.equal(isCoordinate(invalid), false);
    assert.throws(() => keyOf(0, invalid, 0), TypeError);
  }
  for (const key of ['0,0', '0,0,0,0', '00,0,0', '0, 0,0', '-0,0,0', '0,0,NaN', '0,0,1e2', '', null, [0, 0, 0]]) {
    assert.equal(pointOf(key), null);
    assert.throws(() => new Board(false, [key]), TypeError);
  }
  for (const invalid of [null, 0, {}, '0,0,0']) assert.throws(() => new Board(false, invalid), TypeError);
  assert.throws(() => new Board(false, ['0,0,0', 'bad']), TypeError);
});

test('blueprint only edits z <= 0, with independent unbounded X and Y', () => {
  const game = new Game();
  assert.equal(game.start(), false);
  assert.equal(game.click(0, -99, 1), 'locked');
  assert.equal(game.click(0, 99, 0), 'edit');
  assert.equal(game.board.has(0, 99, 0), true);
  assert.equal(game.board.has(0, 0, 99), false);
  for (const point of [[0, 0], [0, 0, NaN], [0, 0.5, 0], [Infinity, 0, 0]]) {
    const before = snapshot(game);
    assert.equal(game.click(...point), 'invalid');
    assert.deepEqual(snapshot(game), before);
  }
  assert.equal(game.click(0, 99, 0), 'edit');
  assert.deepEqual(game.board.stats(), { pieces: 0, holes: 0, advanced: 0, highest: null });
});

for (const direction of DIRECTIONS) {
  test(`legal ${direction} jump consumes one piece and fully undoes`, () => {
    const from = [3, -4, -5], to = from.map((n, axis) => n + direction[axis]);
    const middle = from.map((n, axis) => n + direction[axis] / 2);
    const game = arranged([from, middle]);
    assert.deepEqual(game.board.movesFrom(...from), [to]);
    assert.equal(game.move(from, to), true);
    assert.equal(game.board.stats().pieces, 1);
    assert.equal(game.board.has(...from), false);
    assert.equal(game.board.has(...middle), false);
    assert.equal(game.board.has(...to), true);
    assert.equal(game.steps, 1);
    assert.equal(game.undo(), true);
    assert.deepEqual(game.board.differences, game.initial.differences);
    assert.equal(game.steps, 0);
    assert.equal(game.undo(), false);
  });
}

test('all six directions are offered from the same selected point', () => {
  const board = new Board(false, [[0, 0, 0], ...DIRECTIONS.map(p => p.map(n => n / 2))].map(p => keyOf(...p)));
  assert.deepEqual(board.movesFrom(0, 0, 0), DIRECTIONS);
  assert.equal(DIRECTIONS.length, 6);
  assert.equal(Object.isFrozen(DIRECTIONS), true);
  assert.equal(DIRECTIONS.every(Object.isFrozen), true);
});

test('illegal and malformed moves are atomic and cannot leak between dimensions', () => {
  const game = arranged([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0]]);
  game.click(0, 0, 0);
  const cases = [
    [[0, 0, 0], [2, 0, 0]], [[0, 0, 0], [2, 2, 0]],
    [[0, 0, 0], [0, 0, 2]], [[0, 0, 0], [1, 0, 0]],
    [[0, 0, 0], [0, 1, 1]], [[3, 0, 0], [1, 0, 0]],
    [[0, 0], [0, 2]], [[0, 0, 0, 0], [0, 2, 0, 0]],
    [[0, 0, 0], [Infinity, 0, 0]], [[0, 0, 0], [NaN, 0, 0]],
    [null, [0, 2, 0]], [[0, 0, 0], undefined],
    ['0,0,0', [0, 2, 0]], [{ 0: 0, 1: 0, 2: 0, length: 3 }, [0, 2, 0]],
    [new Array(3), [0, 2, 0]], [[0, 0, 0], [0, 2, '0']],
  ];
  for (const [from, to] of cases) {
    const before = snapshot(game);
    assert.equal(game.board.canMove(from, to), false);
    assert.equal(game.move(from, to), false);
    assert.equal(game.board.flipMove(from, to), false);
    assert.deepEqual(snapshot(game), before);
  }
});

test('invalid toggles and origins never modify board state', () => {
  const board = new Board(true);
  for (const point of [[0, 0], [0, 0, NaN], [0.5, 0, 0], [0, Infinity, 0]]) {
    assert.equal(board.has(...point), false);
    assert.equal(board.toggle(...point), false);
    assert.deepEqual(board.movesFrom(...point), []);
    assert.equal(board.differences.size, 0);
  }
});

test('near the exact-integer boundary midpoint computation remains safe', () => {
  const limit = Number.MAX_SAFE_INTEGER - 4;
  const board = new Board(false, [[limit - 2, 0, -1], [limit - 1, 0, -1]].map(p => keyOf(...p)));
  assert.equal(board.flipMove([limit - 2, 0, -1], [limit, 0, -1]), true);
  assert.deepEqual(board.differences, new Set([keyOf(limit, 0, -1)]));
  assert.equal(board.flipMove([limit - 2, 0, -1], [limit, 0, -1]), true);
  assert.equal(board.differences.size, 2);
  assert.equal(board.canMove([limit, 0, -1], [limit + 2, 0, -1]), false);
});

test('selection tracks X, Y and Z separately and clears after landing', () => {
  const game = arranged([[0, 0, -1], [0, 0, 0], [0, 1, 0], [2, 0, 0]]);
  assert.equal(game.click(0, 0, -1), 'select');
  assert.deepEqual(game.selected, [0, 0, -1]);
  assert.equal(game.click(0, 0, -1), 'deselect');
  assert.equal(game.click(0, 0, 0), 'select');
  assert.equal(game.click(0, 1, 0), 'select');
  assert.deepEqual(game.selected, [0, 1, 0]);
  assert.equal(game.click(90, 90, 90), 'deselect');
  game.click(0, 0, -1);
  assert.equal(game.click(0, 0, 1), 'move');
  assert.equal(game.selected, null);
  assert.equal(game.peak, 1);
  assert.equal(game.undo(), true);
  assert.equal(game.peak, 0);
});

test('infinite half-space uses Z alone and finitely stores holes and advanced pieces', () => {
  const game = new Game();
  assert.equal(game.setBaseline(true), true);
  assert.equal(game.board.has(-90000000, 90000000, -90000000), true);
  assert.equal(game.board.has(0, -90000000, 1), false);
  assert.equal(game.board.differences.size, 0);
  game.start();
  assert.equal(game.move([0, 0, -1], [0, 0, 1]), true);
  assert.deepEqual(game.board.stats(), { pieces: Infinity, holes: 2, advanced: 1, highest: 1 });
  assert.equal(game.move([0, 1, -1], [0, 1, 1]), true);
  assert.equal(game.move([0, 0, 1], [0, 2, 1]), true);
  assert.deepEqual(game.board.stats(), { pieces: Infinity, holes: 4, advanced: 1, highest: 1 });
  assert.equal(game.board.differences.size, 5);
  while (game.undo()) {}
  assert.equal(game.board.differences.size, 0);
});

test('filling an infinite-baseline hole removes its finite exception', () => {
  const game = new Game(); game.setBaseline(true); game.click(0, 0, -2); game.start();
  assert.equal(game.move([0, -2, -2], [0, 0, -2]), true);
  assert.equal(game.board.stats().holes, 2);
  assert.equal(game.board.differences.has('0,0,-2'), false);
  assert.equal(game.undo(), true);
  assert.deepEqual(game.board.differences, new Set(['0,0,-2']));
});

for (const full of [false, true]) {
  test(`restart and blueprint snapshots never alias board or move inputs (full=${full})`, () => {
    const game = new Game(); game.setBaseline(full);
    if (!full) { game.click(0, 0, -1); game.click(0, 0, 0); }
    else game.click(3, -3, -3);
    assert.equal(game.restore('play'), false);
    game.start();
    const initial = game.initial.clone(), from = [0, 0, -1], to = [0, 0, 1];
    assert.equal(game.move(from, to), true);
    from[0] = 10; to[2] = 17;
    assert.equal(game.undo(), true);
    assert.deepEqual(game.board.differences, initial.differences);
    assert.equal(game.move([0, 0, -1], [0, 0, 1]), true);
    assert.equal(game.setBaseline(false), false);
    assert.equal(game.restore('invalid'), false);
    assert.equal(game.restore('play'), true);
    assert.equal(game.steps, 0);
    assert.equal(game.peak, 0);
    assert.equal(game.mode, 'play');
    assert.deepEqual(game.board.differences, initial.differences);
    assert.equal(game.restore('blueprint'), true);
    game.click(12, 12, -12);
    assert.deepEqual(game.initial.differences, initial.differences);
    assert.equal(game.start(), true);
    assert.equal(game.initial.differences.has('12,12,-12'), true);
  });
}

test('clear/fill confirmation depends only on finite layout differences', () => {
  const game = new Game();
  for (const full of [false, true]) {
    game.setBaseline(full);
    assert.equal(game.needsLayoutConfirmation, false);
    game.click(-7, 2, -2);
    assert.equal(game.needsLayoutConfirmation, true);
    game.click(-7, 2, -2);
    assert.equal(game.needsLayoutConfirmation, false);
  }
});

test('start rejects injected malformed layouts and pieces above the placement half-space', () => {
  for (const key of ['0,0,1', '0,0', 'NaN,0,0']) {
    const game = new Game();
    game.board.differences.add(key);
    const before = snapshot(game);
    assert.equal(game.start(), false);
    assert.deepEqual(snapshot(game), before);
    assert.equal(game.initial, null);
  }
});

test('engine has no artificial seven/eight-layer movement cap', () => {
  for (const z of [7, 8, 99]) {
    const from = [0, 0, z - 2], to = [0, 0, z];
    const board = new Board(false, [from, [0, 0, z - 1]].map(p => keyOf(...p)));
    assert.equal(board.canMove(from, to), true);
    assert.equal(board.flipMove(from, to), true);
    assert.equal(board.stats().highest, z);
  }
});

test('introductory demo is legal from z <= 0, uses all three axes and reaches layer two', () => {
  assert.ok(DEMO_CELLS.every(point => point[2] <= 0));
  const game = arranged(DEMO_CELLS), usedAxes = new Set();
  for (const { from, to } of DEMO_MOVES) {
    usedAxes.add(from.findIndex((n, axis) => n !== to[axis]));
    assert.equal(game.move(from, to), true);
  }
  assert.equal(usedAxes.size, 3);
  assert.deepEqual(game.board.differences, new Set(['0,0,2']));
  assert.equal(game.peak, 2);
  assert.equal(game.steps, 4);
  while (game.undo()) {}
  assert.deepEqual(game.board.differences, game.initial.differences);
});

for (const full of [false, true]) {
  test(`deterministic 3D play preserves counting and all undo state (full=${full})`, () => {
    const game = new Game(); game.setBaseline(full);
    if (!full) {
      for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -4; z <= 0; z++) {
        game.click(x, y, z);
      }
    } else { game.click(0, 0, -3); game.click(2, 1, -2); }
    game.start();
    const original = game.initial.clone(), initialStats = original.stats();
    let seed = 73;
    for (let iteration = 0; iteration < 120; iteration++) {
      const moves = [];
      for (let x = -5; x <= 5; x++) for (let y = -5; y <= 5; y++) for (let z = -6; z <= 4; z++) {
        for (const to of game.board.movesFrom(x, y, z)) moves.push([[x, y, z], to]);
      }
      if (!moves.length) break;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      assert.equal(game.move(...moves[seed % moves.length]), true);
      const stats = game.board.stats();
      assert.equal(full ? stats.holes - stats.advanced : initialStats.pieces - stats.pieces,
        game.steps + (full ? initialStats.holes : 0));
    }
    assert.equal(game.steps, 120);
    while (game.undo()) {}
    assert.deepEqual(game.board.differences, original.differences);
    assert.equal(game.peak, 0);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Board, Game, keyOf } from '../src/engine.js';

const arranged = points => {
  const game = new Game();
  points.forEach(point => game.click(...point));
  assert.equal(game.start(), true);
  return game;
};

test('blueprint edits are restricted to integer coordinates in y <= 0', () => {
  const game = new Game();
  assert.equal(game.start(), false);
  assert.equal(game.click(0, 1), 'locked');
  assert.equal(game.click(.5, 0), 'invalid');
  assert.equal(game.click(NaN, 0), 'invalid');
  assert.equal(game.click(0, 0), 'edit');
  assert.equal(game.board.has(0, 0), true);
  game.click(0, 0);
  assert.equal(game.board.stats().pieces, 0);
  assert.equal(game.needsLayoutConfirmation, false);
});

for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
  test(`legal direction ${dx},${dy} consumes exactly one piece and is reversible`, () => {
    const from = [0, -5], to = [dx, -5 + dy], middle = [dx / 2, -5 + dy / 2];
    const game = arranged([from, middle]);
    assert.equal(game.move(from, to), true);
    assert.equal(game.board.stats().pieces, 1);
    assert.equal(game.board.has(...to), true);
    assert.equal(game.steps, 1);
    assert.equal(game.selected, null);
    assert.equal(game.undo(), true);
    assert.deepEqual(game.board.differences, new Set([from, middle].map(p => keyOf(...p))));
    assert.equal(game.undo(), false);
  });
}

test('illegal moves are atomic, including diagonal and occupied destinations', () => {
  const game = arranged([[0, 0], [1, 0], [2, 0]]), before = game.board.clone();
  for (const [from, to] of [[[0, 0], [2, 0]], [[0, 0], [2, 2]], [[0, 0], [0, 2]], [[0, 0], [1, 0]], [[4, 0], [2, 0]], [[0, 0], [Infinity, 0]]]) {
    assert.equal(game.move(from, to), false);
    assert.deepEqual(game.board.differences, before.differences);
    assert.equal(game.steps, 0);
  }
});

test('selection switches, deselects, and clears on landing', () => {
  const game = arranged([[0, -1], [0, 0], [2, 0]]);
  assert.equal(game.click(0, -1), 'select');
  assert.deepEqual(game.board.movesFrom(0, -1), [[0, 1]]);
  assert.equal(game.click(0, -1), 'deselect');
  game.click(2, 0); game.click(0, -1);
  assert.deepEqual(game.selected, [0, -1]);
  assert.equal(game.click(5, 5), 'deselect');
  game.click(0, -1);
  assert.equal(game.click(0, 1), 'move');
  assert.equal(game.selected, null);
});

test('full baseline stores holes below and occupied pieces above independently', () => {
  const game = new Game(); game.setBaseline(true); game.start();
  assert.equal(game.board.has(-90000000, -90000000), true);
  assert.equal(game.board.has(0, 1), false);
  assert.equal(game.move([0, -1], [0, 1]), true);
  assert.deepEqual(game.board.stats(), { pieces: Infinity, holes: 2, advanced: 1, highest: 1 });
  assert.equal(game.board.differences.size, 3);
  assert.equal(game.move([1, -1], [1, 1]), true);
  assert.equal(game.move([0, 1], [2, 1]), true);
  assert.deepEqual(game.board.stats(), { pieces: Infinity, holes: 4, advanced: 1, highest: 1 });
  while (game.undo()) {}
  assert.equal(game.board.differences.size, 0);
});

test('a move can fill a full-baseline hole and remove its difference entry', () => {
  const game = new Game(); game.setBaseline(true); game.click(0, -2); game.start();
  assert.equal(game.move([-2, -2], [0, -2]), true);
  assert.equal(game.board.stats().holes, 2);
  assert.equal(game.board.differences.has('0,-2'), false);
  game.undo(); assert.deepEqual(game.board.differences, new Set(['0,-2']));
});

for (const full of [false, true]) {
  test(`snapshot and restart do not alias the working board (full=${full})`, () => {
    const game = new Game(); game.setBaseline(full);
    if (!full) { game.click(0, -1); game.click(0, 0); }
    else game.click(3, -3);
    game.start();
    const initial = game.initial.clone();
    game.move([0, -1], [0, 1]); game.restore('play');
    assert.equal(game.steps, 0); assert.equal(game.mode, 'play');
    assert.deepEqual(game.board.differences, initial.differences);
    game.move([0, -1], [0, 1]); game.restore('blueprint');
    assert.equal(game.steps, 0); assert.equal(game.selected, null);
    assert.deepEqual(game.board.differences, initial.differences);
    game.click(12, -12);
    assert.deepEqual(game.initial.differences, initial.differences);
    game.start();
    assert.equal(game.initial.differences.has('12,-12'), true);
  });
}

test('clear/fill confirmation is needed only when there is a finite layout difference', () => {
  const game = new Game();
  for (const full of [false, true]) {
    game.setBaseline(full); assert.equal(game.needsLayoutConfirmation, false);
    game.click(-7, -2); assert.equal(game.needsLayoutConfirmation, true);
    game.click(-7, -2); assert.equal(game.needsLayoutConfirmation, false);
  }
});

test('rule engine imposes no artificial restriction on a legal fifth-row move', () => {
  const board = new Board(false, ['0,3', '0,4']);
  assert.equal(board.canMove([0, 3], [0, 5]), true);
});

// These are user-supplied constructions, not solutions copied from the implementation.
const score = await readFile(new URL('../conways_soldiers_minimal_constructions_and_animation.md', import.meta.url), 'utf8');
const scenes = score.split(/^# [4-8]\. Level /m).slice(1);
const row = (min, max, y) => Array.from({ length: max - min + 1 }, (_, i) => [min + i, y]);
const layouts = [
  [[0, -1], [0, 0]],
  [[0, -1], [0, 0], [1, 0], [2, 0]],
  [...row(-2, 2, 0), ...row(0, 2, -1)],
  [...row(-2, 4, 0), ...row(-2, 3, -1), ...row(-2, 2, -2), [0, -3], [2, -3]],
  ...[ [...row(-2, 2, 0), ...row(-2, 2, -1), ...row(-2, 2, -2), ...row(-2, 2, -3), [0, -4]] ],
];
assert.equal(scenes.length, 5);
for (let i = 0; i < scenes.length; i++) {
  test(`provided construction: ${layouts[i].length} soldiers reaches row ${Math.min(i + 1, 4)}`, () => {
    const block = [...scenes[i].matchAll(/```text\s*([\s\S]*?)```/g)].map(m => m[1]).find(text => /^E01\./m.test(text));
    const moves = [...block.matchAll(/^E\d+\.\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s*->\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/gm)].map(m => m.slice(1).map(Number));
    const game = arranged(layouts[i]);
    for (const [x, y, u, v] of moves) assert.equal(game.move([x, y], [u, v]), true, `move ${x},${y} -> ${u},${v}`);
    assert.equal(game.steps, layouts[i].length - 1);
    assert.deepEqual(game.board.differences, new Set([`0,${Math.min(i + 1, 4)}`]));
    while (game.undo()) {}
    assert.deepEqual(game.board.differences, game.initial.differences);
  });
}

for (const full of [false, true]) {
  test(`deterministic long game preserves counting invariants and reversibility (full=${full})`, () => {
    const game = new Game(); game.setBaseline(full);
    if (!full) for (let x = -6; x <= 6; x++) for (let y = -7; y <= 0; y++) game.click(x, y);
    else { game.click(0, -3); game.click(2, -5); }
    game.start(); const original = game.initial.clone();
    let seed = 73;
    for (let iteration = 0; iteration < 120; iteration++) {
      const moves = [];
      for (let x = -9; x <= 9; x++) for (let y = -10; y <= 4; y++) for (const to of game.board.movesFrom(x, y)) moves.push([[x, y], to]);
      if (!moves.length) break;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      assert.equal(game.move(...moves[seed % moves.length]), true);
      const stats = game.board.stats();
      assert.equal(full ? stats.holes - stats.advanced : original.stats().pieces - stats.pieces, game.steps + (full ? original.stats().holes : 0));
    }
    assert.ok(game.steps > 20);
    while (game.undo()) {}
    assert.deepEqual(game.board.differences, original.differences);
  });
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const loadGameContext = require('../scripts/game_context.cjs');

function board(context, rows) {
  const game = context.createGame();
  game.grid = new context.Grid(4);
  game.score = 0;
  rows.forEach((row, y) => row.forEach((value, x) => {
    if (value) game.grid.insertTile(new context.Tile({ x, y }, value));
  }));
  return game;
}

test('simulation preserves the live board, score, and random stream', () => {
  const ctx = loadGameContext();
  const game = board(ctx, [[2,2,2,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  const snapshot = JSON.stringify(game.serialize());
  vm.runInContext('Math.random = function() { throw Error("unexpected spawn"); };', ctx);
  const trial = ctx.simulateMove(game, 3);
  assert.deepEqual(Array.from(trial.grid.cells, col => col[0]?.value || 0), [4,4,0,0]);
  assert.equal(trial.score, 8);
  assert.equal(JSON.stringify(game.serialize()), snapshot);
  const choice = ctx.chooseMove(game);
  assert.equal(choice.depth, 2);
  assert.equal(JSON.stringify(game.serialize()), snapshot);
});

test('crowded search avoids a move that loses after every possible spawn', () => {
  const ctx = loadGameContext();
  const game = board(ctx, [[16,64,32,64],[8,16,0,2],[16,4,16,64],[128,2,64,2]]);
  const snapshot = JSON.stringify(game.serialize());
  vm.runInContext('Math.random = function() { throw Error("unexpected spawn"); };', ctx);
  const choice = ctx.chooseMove(game);
  assert.equal(choice.depth, 4);
  assert.notEqual(choice.direction, 2);
  const trial = ctx.simulateMove(game, choice.direction);
  for (const cell of trial.grid.availableCells()) {
    for (const value of [2,4]) {
      trial.grid.insertTile(new ctx.Tile(cell, value));
      assert.ok(trial.movesAvailable());
      trial.grid.removeTile(cell);
    }
  }
  assert.equal(JSON.stringify(game.serialize()), snapshot);
});

test('no legal move returns null and ordered lines work in either orientation', () => {
  const ctx = loadGameContext();
  const game = board(ctx, [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]]);
  assert.equal(ctx.chooseMove(game), null);
  assert.equal(ctx.scoreLine([8,7,6,5]), ctx.scoreLine([5,6,7,8]));
  assert.ok(ctx.scoreLine([8,7,6,5]) > ctx.scoreLine([8,5,7,6]));
});

test('negative evaluations are not clamped to the old -1000000 initializer', () => {
  const ctx = loadGameContext();
  const game = board(ctx, [[2,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  ctx.evaluateBoard = () => -2000000;
  assert.ok(Math.abs(ctx.expectedValue(game, 1, new Map()) + 2000000) < 0.001);
});

test('large legal boards rank above losing and merges are not capped at 2048', () => {
  const ctx = loadGameContext();
  const high = board(ctx, [[65536,4,32768,8],[16,8192,32,16384],[4096,64,2048,128],[256,512,0,1024]]);
  const dead = board(ctx, [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]]);
  assert.ok(ctx.evaluateBoard(high) > ctx.evaluateBoard(dead));
  const game = board(ctx, [[65536,65536,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]);
  assert.equal(ctx.simulateMove(game, 3).grid.cells[0][0].value, 131072);
});

test('controller resumes, pauses, hands off, restarts and stops after game over', () => {
  const elements = new Map();
  const jobs = new Map();
  let nextId = 0;
  const ctx = loadGameContext({
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { addEventListener(name, fn) { this[name] = fn; } });
      return elements.get(id);
    } },
    setTimeout(fn) { jobs.set(++nextId, fn); return nextId; },
    clearTimeout(id) { jobs.delete(id); }
  });
  const game = ctx.createGame();
  new ctx.Autopilot(game);
  const auto = elements.get('auto-toggle');
  auto.click();
  assert.equal(jobs.size, 1);
  auto.click();
  assert.equal(jobs.size, 0);
  auto.click();
  game.inputManager.emit('move', 3);
  assert.equal(jobs.size, 0);
  game.inputManager.emit('restart');
  assert.match(elements.get('auto-stats').textContent, /自动移动 0 步/);
  game.over = true;
  auto.click();
  assert.equal(jobs.size, 0);
  assert.match(elements.get('auto-status').textContent, /本局结束/);
});

test('automatic play continues beyond the 2048 win message', () => {
  const elements = new Map();
  const ctx = loadGameContext({
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { addEventListener(name, fn) { this[name] = fn; } });
      return elements.get(id);
    } },
    setTimeout() {}, clearTimeout() {}
  });
  const game = ctx.createGame();
  game.won = true;
  game.keepPlaying = false;
  new ctx.Autopilot(game);
  elements.get('auto-step').click();
  assert.equal(game.keepPlaying, true);
  assert.equal(game.isGameTerminated(), false);
});

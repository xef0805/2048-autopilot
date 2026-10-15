// Simulate only the player's move; random spawns are evaluated separately.
function simulateMove(game, direction) {
  var trial = Object.create(GameManager.prototype);
  trial.size = game.size;
  trial.grid = new Grid(game.size, game.grid.serialize().cells);
  trial.score = game.score;
  trial.over = false;
  trial.won = false;
  trial.keepPlaying = true;
  trial.addRandomTile = function () {};
  var moved = false;
  trial.actuate = function () { moved = true; };
  trial.move(direction);
  return moved ? trial : null;
}

// Row/column evaluation inspired by nneonneo/2048-ai (MIT):
// https://github.com/nneonneo/2048-ai/blob/master/2048.cpp
var lineScores = new Map();
var lostBoardValue = -1000000000;
function scoreLine(line) {
  var key = line.join(",");
  if (lineScores.has(key)) return lineScores.get(key);
  var value = 200000;
  var rising = 0, falling = 0, previous = 0, group = 0;
  line.forEach(function (rank, index) {
    value -= 11 * Math.pow(rank, 3.5);
    if (!rank) value += 270;
    else {
      if (rank === previous) group++;
      else {
        if (group > 1) value += group * 700;
        previous = rank;
        group = 1;
      }
    }
    if (index) {
      var difference = Math.pow(rank, 4) - Math.pow(line[index - 1], 4);
      if (difference > 0) rising += difference;
      else falling -= difference;
    }
  });
  if (group > 1) value += group * 700;
  value -= 47 * Math.min(rising, falling);
  lineScores.set(key, value);
  return value;
}

function evaluateBoard(game) {
  if (!game.movesAvailable()) return lostBoardValue;
  var value = 0;
  for (var index = 0; index < game.size; index++) {
    var row = [], column = [];
    for (var position = 0; position < game.size; position++) {
      var horizontal = game.grid.cells[position][index];
      var vertical = game.grid.cells[index][position];
      row.push(horizontal ? Math.log2(horizontal.value) : 0);
      column.push(vertical ? Math.log2(vertical.value) : 0);
    }
    value += scoreLine(row) + scoreLine(column);
  }
  return value;
}

function expectedValue(game, depth, cache) {
  if (!depth) return evaluateBoard(game);
  var key = depth + ":" + game.grid.cells.map(function (column) {
    return column.map(function (tile) { return tile ? tile.value : 0; }).join(",");
  }).join(";");
  if (cache.has(key)) return cache.get(key);
  var empty = game.grid.availableCells();
  if (!empty.length) return evaluateBoard(game);
  var expected = 0;
  empty.forEach(function (cell) {
    [2, 4].forEach(function (number) {
      game.grid.insertTile(new Tile(cell, number));
      var best = -Infinity;
      for (var direction = 0; direction < 4; direction++) {
        var next = simulateMove(game, direction);
        if (next) best = Math.max(best, expectedValue(next, depth - 1, cache));
      }
      game.grid.removeTile(cell);
      if (best === -Infinity) best = lostBoardValue;
      expected += best * (number === 2 ? 0.9 : 0.1) / empty.length;
    });
  });
  cache.set(key, expected);
  return expected;
}

function chooseMove(game) {
  // Spend more search on crowded boards, where a short horizon misses traps.
  var empty = game.grid.availableCells().length;
  var depth = empty <= 2 ? 3 : empty <= 5 ? 2 : 1;
  var cache = new Map();
  var best = null;
  [2, 3, 1, 0].forEach(function (direction) {
    var trial = simulateMove(game, direction);
    if (!trial) return;
    var value = expectedValue(trial, depth, cache);
    if (!best || value > best.value) {
      best = { direction: direction, value: value, depth: depth + 1 };
    }
  });
  return best;
}

function Autopilot(game) {
  var stepButton = document.getElementById("auto-step");
  var autoButton = document.getElementById("auto-toggle");
  var status = document.getElementById("auto-status");
  var stats = document.getElementById("auto-stats");
  var timer = null;
  var running = false;
  var steps = 0;
  var directions = ["上", "右", "下", "左"];

  function render() {
    var maxTile = 0;
    game.grid.eachCell(function (x, y, tile) {
      if (tile) maxTile = Math.max(maxTile, tile.value);
    });
    stats.textContent = "得分 " + game.score + " · 最大方块 " + maxTile +
      " · 自动移动 " + steps + " 步";
  }

  function pause() {
    running = false;
    clearTimeout(timer);
    timer = null;
    autoButton.textContent = "连续自动玩";
  }

  function step() {
    if (game.won && !game.keepPlaying) {
      GameManager.prototype.keepPlaying.call(game);
    }
    var choice = game.over ? null : chooseMove(game);
    if (!choice) {
      pause();
      status.textContent = "本局结束。点击“新开一局”再次挑战。";
      render();
      return;
    }
    game.move(choice.direction);
    steps++;
    status.textContent = "向" + directions[choice.direction] +
      "移动：本步预判 " + choice.depth + " 次移动及其间的随机出块，兼顾空位、有序排列和合并机会。";
    render();
    if (game.over) {
      pause();
      status.textContent += " 本局结束。";
    }
  }

  stepButton.addEventListener("click", function () { pause(); step(); });
  function run() {
    step();
    if (running) timer = setTimeout(run, 20);
  }

  autoButton.addEventListener("click", function () {
    if (running) {
      pause();
      status.textContent = "已暂停，可以点击“自动走一步”逐步观察。";
      return;
    }
    running = true;
    autoButton.textContent = "暂停";
    run();
  });
  game.inputManager.on("move", function () {
    pause();
    status.textContent = "已切换到手动操作。";
    render();
  });
  game.inputManager.on("restart", function () {
    pause();
    steps = 0;
    status.textContent = "新棋盘已准备好。";
    render();
  });
  render();
}

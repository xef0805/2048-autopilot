const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const loadGameContext = require('./game_context.cjs');

const count = Number(process.argv[2] || 1);
const firstSeed = Number(process.argv[3] || 1);
if (!Number.isSafeInteger(count) || count < 1 ||
    !Number.isSafeInteger(firstSeed) || firstSeed < 1 ||
    !Number.isSafeInteger(firstSeed + count)) {
  console.error('用法：node scripts/benchmark.cjs [正整数局数] [正整数起始种子]');
  process.exit(1);
}

const context = loadGameContext({ console });
const games = [];
for (let seed = firstSeed; seed < firstSeed + count; seed++) {
  context.seed = seed;
  vm.runInContext(`
    var randomState = seed >>> 0;
    Math.random = function() {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    var game = createGame();
    var steps = 0;
    while (!game.over) {
      if (game.won && !game.keepPlaying) GameManager.prototype.keepPlaying.call(game);
      var choice = chooseMove(game);
      if (!choice) throw Error('游戏未结束，但自动玩家没有返回合法方向');
      game.move(choice.direction);
      steps++;
      if (steps % 1000 === 0) {
        console.log('进行中：种子 ' + seed + '，' + steps + ' 步，' + game.score + ' 分');
      }
    }
    var maxTile = 0;
    game.grid.eachCell(function(x,y,tile) {
      if (tile) maxTile = Math.max(maxTile, tile.value);
    });
    var result = { seed: seed, score: game.score, maxTile: maxTile, steps: steps };
  `, context);
  games.push(JSON.parse(JSON.stringify(context.result)));
  const scores = games.map(game => game.score).sort((a,b) => a-b);
  const summary = {
    completedGames: games.length,
    meanScore: scores.reduce((a,b) => a+b,0) / scores.length,
    medianScore: (scores[Math.floor((scores.length-1)/2)] + scores[Math.floor(scores.length/2)])/2,
    highestScore: Math.max(...scores),
    largestTile: Math.max(...games.map(game => game.maxTile)),
    reached8192: games.filter(game => game.maxTile >= 8192).length
  };
  fs.writeFileSync(path.join(__dirname, '..', 'benchmark-results.json'),
    JSON.stringify({ rules: '4x4, 90% 2 / 10% 4, seeded LCG', summary, games }, null, 2) + '\n');
  console.log('本局完成：' + JSON.stringify(games.at(-1)));
  console.log('已完成对局汇总：' + JSON.stringify(summary));
}

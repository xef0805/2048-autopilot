const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Run the same browser game and AI without drawing a page.
module.exports = function loadGameContext(environment = {}) {
  const context = vm.createContext(environment);
  for (const name of ['tile', 'grid', 'game_manager', 'autopilot']) {
    const filename = path.join(__dirname, '..', 'js', name + '.js');
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  vm.runInContext(`
    function Input() { this.events = {}; }
    Input.prototype.on = function(name, fn) {
      (this.events[name] || (this.events[name] = [])).push(fn);
    };
    Input.prototype.emit = function(name, value) {
      (this.events[name] || []).forEach(function(fn) { fn(value); });
    };
    function View() {}
    View.prototype.actuate = View.prototype.continueGame = function() {};
    function Store() {}
    Store.prototype.getGameState = function() { return null; };
    Store.prototype.getBestScore = function() { return 0; };
    Store.prototype.setBestScore = Store.prototype.setGameState =
      Store.prototype.clearGameState = function() {};
    function createGame() { return new GameManager(4, Input, View, Store); }
  `, context);
  return context;
};

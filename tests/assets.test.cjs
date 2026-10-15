const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');

test('all local page scripts, styles, images and fonts exist', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  for (const file of ['main.css', 'autopilot.css', 'fonts/clear-sans.css']) {
    const css = fs.readFileSync(path.join(root, 'style', file), 'utf8');
    for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      references.push(path.join('style', path.dirname(file), match[1]));
    }
  }
  for (const reference of references) {
    if (/^(https?:|data:|#)/.test(reference)) continue;
    assert.ok(fs.existsSync(path.join(root, reference)), 'Missing resource: ' + reference);
  }
});

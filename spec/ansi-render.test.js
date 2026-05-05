var test = require('tape');
var ansi = require('../lib/ansi-render');

test('ansi: plain text passes through unchanged', function (t) {
  var r = ansi.chunkToTags('hello world', null);
  t.equal(r[0], 'hello world');
  t.end();
});

test('ansi: SGR red foreground -> blessed {red-fg} tags', function (t) {
  var r = ansi.chunkToTags('\x1b[31mred-text\x1b[0m', null);
  t.ok(r[0].indexOf('{red-fg}') !== -1, 'red-fg open tag present');
  t.ok(r[0].indexOf('red-text') !== -1, 'inner text preserved');
  t.ok(r[0].indexOf('{/red-fg}') !== -1, 'red-fg close tag present');
  t.end();
});

test('ansi: SGR bold + cyan combine into nested tags', function (t) {
  var r = ansi.chunkToTags('\x1b[1;36mbold-cyan\x1b[0m tail', null);
  t.ok(r[0].indexOf('{cyan-fg}') !== -1, 'cyan-fg present');
  t.ok(r[0].indexOf('{bold}') !== -1, 'bold present');
  t.ok(r[0].indexOf('bold-cyan') !== -1, 'styled text preserved');
  t.ok(r[0].indexOf(' tail') !== -1, 'unstyled tail preserved');
  t.end();
});

test('ansi: blessed-meaningful braces in user output are escaped', function (t) {
  var r = ansi.chunkToTags('like {this} or {bold}', null);
  t.equal(r[0].indexOf('{open}') >= 0, true, 'open brace escaped');
  t.equal(r[0].indexOf('{close}') >= 0, true, 'close brace escaped');
  t.equal(r[0].indexOf('{bold}'), -1, 'no real bold tag opened');
  t.end();
});

test('ansi: backspace deletes previous character', function (t) {
  var r = ansi.chunkToTags('abXc\b\b', null);
  t.equal(r[0], 'ab');
  t.end();
});

test('ansi: bell character is dropped', function (t) {
  var r = ansi.chunkToTags('hi\x07!', null);
  t.equal(r[0], 'hi!');
  t.end();
});

test('ansi: state carries between chunks', function (t) {
  var r1 = ansi.chunkToTags('\x1b[33myel', null);
  var r2 = ansi.chunkToTags('low\x1b[0m', r1[1]);
  t.ok(r1[0].indexOf('{yellow-fg}') !== -1, 'first chunk opens yellow');
  t.ok(r2[0].indexOf('low') !== -1, 'second chunk renders text');
  // The second chunk should still emit yellow tags around 'low' before closing.
  t.ok(r2[0].indexOf('{yellow-fg}') !== -1, 'second chunk re-opens yellow for new run');
  t.end();
});

test('ansi: non-SGR CSI sequences are silently dropped', function (t) {
  // CSI H (cursor home), CSI 2J (clear screen), CSI K (clear line).
  var r = ansi.chunkToTags('\x1b[H\x1b[2J\x1b[Kvisible', null);
  t.equal(r[0], 'visible');
  t.end();
});

test('ansi: 256-color FG degrades to a basic color name', function (t) {
  var r = ansi.chunkToTags('\x1b[38;5;1mred256\x1b[0m', null);
  t.ok(r[0].indexOf('{red-fg}') !== -1, '256-index 1 -> red');
  t.end();
});

test('ansi: applySgr resets state on parameter 0', function (t) {
  var s = { fg: 'red', bg: 'blue', bold: true, underline: true, inverse: true };
  var s2 = ansi._applySgr(s, [0]);
  t.deepEqual(s2, { fg: null, bg: null, bold: false, underline: false, inverse: false });
  t.end();
});

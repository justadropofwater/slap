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

test('ansi: backspace alone moves cursor without erasing', function (t) {
  // Real terminals never erase on plain \b -- they just move the cursor
  // back. The shell sends "\b \b" to actually erase a character. This
  // matches xterm / VT100 behavior.
  var r = ansi.chunkToTags('abXc\b\b', null);
  t.equal(r[0], 'abXc', 'cells stay; cursor just moved back');
  t.end();
});

test('ansi: backspace+space+backspace pattern clears the previous character', function (t) {
  // Standard "erase last char on the line" pattern that readline emits.
  var r = ansi.chunkToTags('abc\b \b', null);
  t.equal(r[0], 'ab ', '"c" overwritten by space, cursor back over the space');
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

// ---------------------------------------------------------------------------
// Buffer API (Phase 4b)
// ---------------------------------------------------------------------------

test('ansi buffer: feed plain text accumulates in current line', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'hello');
  t.equal(buf.committed, '', 'no committed lines yet');
  t.equal(ansi.render(buf), 'hello', 'render shows current run');
  t.end();
});

test('ansi buffer: \\n commits current line to scrollback', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'line one\nline two');
  t.equal(buf.committed, 'line one\n', 'first line committed');
  t.equal(ansi.render(buf), 'line one\nline two', 'render = committed + current');
  t.end();
});

test('ansi buffer: \\r overwrites current line in place (regression for tab-completion redraws)', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'foo\rbar\n');
  t.equal(buf.committed, 'bar\n', '"foo" was overwritten by "bar" before commit');
  t.equal(ansi.render(buf), 'bar\n');
  t.end();
});

test('ansi buffer: progress-bar pattern (\\r between updates) shows the latest only', function (t) {
  var buf = ansi.createBuffer();
  // Three "frames" of a progress bar, none of them ending in \n.
  ansi.feed(buf, '[10%]\r[50%]\r[100%]');
  t.equal(buf.committed, '', 'no commits without \\n');
  t.equal(ansi.render(buf), '[100%]', 'only the last frame is visible');
  t.end();
});

test('ansi buffer: CSI 2K clears whole current line', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'partial\x1b[2K');
  t.equal(ansi.render(buf), '', 'CSI 2K wipes current line');
  t.end();
});

test('ansi buffer: CSI K (cursor-to-end) is a no-op for our line model', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'kept\x1b[Kafter');
  t.equal(ansi.render(buf), 'keptafter', '"kept" survives because we do not track within-line cursor');
  t.end();
});

test('ansi buffer: backspace pops one Unicode codepoint', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'cafe\u0301\b');  // "cafe" + COMBINING ACUTE; \b drops the combining char
  ansi.feed(buf, 'OK');
  t.ok(/cafeOK/.test(ansi.render(buf)), 'backspace dropped only the trailing combining mark');
  t.end();
});

test('ansi buffer: SGR persists across \\r line clears', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[31mfirst\rsecond');
  // "first" was overwritten, but we should still be in red.
  t.ok(/\{red-fg\}second\{\/red-fg\}/.test(ansi.render(buf)), 'red SGR still active after \\r');
  t.end();
});

test('ansi buffer: SGR persists across feed boundaries', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[33myel');
  ansi.feed(buf, 'low\x1b[0m\n');
  t.equal(buf.committed.indexOf('{yellow-fg}'), 0, 'committed line opens with yellow');
  t.ok(/yellow.*low.*\/yellow/.test(buf.committed), '"yel" + "low" stitched into one yellow run');
  t.end();
});

test('ansi buffer: braces in printable bytes are escaped (regression for cat README crash)', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'mkdir({recursive: true})\n');
  t.ok(buf.committed.indexOf('{open}recursive') !== -1, 'literal { escaped to {open}');
  t.ok(buf.committed.indexOf('{close}') !== -1, 'literal } escaped to {close}');
  t.equal(buf.committed.indexOf('{recursive'), -1, 'no raw blessed-tag-shaped string');
  t.end();
});

test('ansi buffer: maxCommittedLines bounds memory', function (t) {
  var buf = ansi.createBuffer({ maxCommittedLines: 3 });
  ansi.feed(buf, 'a\nb\nc\nd\ne\n');
  t.equal(buf.committed, 'c\nd\ne\n', 'oldest lines dropped, last 3 retained');
  t.end();
});

test('ansi buffer: reset clears committed and current but preserves SGR', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[32mline1\nline2');
  ansi.reset(buf);
  t.equal(buf.committed, '', 'committed cleared');
  t.equal(ansi.render(buf), '', 'render empty');
  ansi.feed(buf, 'after');
  t.ok(ansi.render(buf).indexOf('{green-fg}') !== -1, 'SGR survived reset');
  t.end();
});

test('ansi buffer: tab-completion list pattern renders the redrawn prompt only once', function (t) {
  // Approximates what readline does when there are multiple matches:
  //   - emit \n
  //   - print the candidates
  //   - \r and re-emit prompt + current input
  var buf = ansi.createBuffer();
  ansi.feed(buf, '$ cat REA\nREADME.md  README.tmp.md\n\r$ cat REA');
  // Committed should contain the 2 lines that ended with \n; current should
  // contain just the redrawn prompt line.
  var committedLines = buf.committed.split('\n');
  t.equal(committedLines.length, 3, '2 committed lines + trailing empty marker');
  t.equal(ansi.render(buf).split('\n').pop(), '$ cat REA', 'final visible line is the redrawn prompt');
  t.end();
});

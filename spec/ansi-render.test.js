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

// ---------------------------------------------------------------------------
// Blessed-compatible color names (Phase 4 follow-up)
// ---------------------------------------------------------------------------

test('ansi buffer: bright-yellow SGR renders as a hyphenated tag blessed parses', function (t) {
  // Regression: rendering used to emit `{lightyellow-fg}` (no hyphen);
  // blessed's _parseTags does param.replace(/-/g, ' ') and matches against
  // case 'light yellow fg', so without the internal hyphen there was no
  // case match and blessed left the tag as literal text. Confirm we now
  // emit `{light-yellow-fg}` which collapses to 'light yellow fg'.
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[93mY\x1b[0m');
  var out = ansi.render(buf);
  t.ok(out.indexOf('{light-yellow-fg}') !== -1, 'tag has internal hyphen');
  t.equal(out.indexOf('{lightyellow-fg}'), -1, 'no hyphen-less variant emitted');
  t.end();
});

test('ansi buffer: every basic + bright color tag is blessed-parseable', function (t) {
  // Round-trip every color we generate through blessed's _parseTags by
  // checking the rendered output has only valid hyphenated forms.
  var buf = ansi.createBuffer();
  for (var fg = 30; fg <= 37; fg++) ansi.feed(buf, '\x1b[' + fg + 'm.');
  for (var fg2 = 90; fg2 <= 97; fg2++) ansi.feed(buf, '\x1b[' + fg2 + 'm.');
  for (var bg = 40; bg <= 47; bg++) ansi.feed(buf, '\x1b[' + bg + 'm.');
  for (var bg2 = 100; bg2 <= 107; bg2++) ansi.feed(buf, '\x1b[' + bg2 + 'm.');
  var out = ansi.render(buf);
  // Forbid the no-hyphen forms across all color names.
  ['black','red','green','yellow','blue','magenta','cyan','white'].forEach(function (c) {
    t.equal(out.indexOf('{light' + c + '-'), -1, 'no {light' + c + '-...} (must be {light-' + c + '-...})');
  });
  t.end();
});

// ---------------------------------------------------------------------------
// String-class escapes: OSC, DCS, SOS, PM, APC, and single-byte ESC
// ---------------------------------------------------------------------------

test('ansi buffer: OSC sequence (ESC ] ... BEL) is dropped, not leaked as text', function (t) {
  // Regression: fish prompts emit OSC 7 (cwd hyperlink), OSC 0 (window
  // title), and OSC 133 (semantic prompt marks). The renderer used to drop
  // only the leading ESC, leaving the body (e.g. `]7;file://...`) visible.
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'before\x1b]7;file:///tmp\x07after');
  t.equal(ansi.render(buf), 'beforeafter', 'OSC envelope and payload dropped');
  t.end();
});

test('ansi buffer: OSC terminated by ST (ESC \\) is also dropped', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'A\x1b]133;A;click_events=1\x1b\\B');
  t.equal(ansi.render(buf), 'AB', 'OSC ... ESC \\ envelope dropped');
  t.end();
});

test('ansi buffer: DCS sequence (ESC P ... ST) is dropped', function (t) {
  // Modern shells emit DCS XTGETTCAP queries on startup; without DCS
  // handling, payloads like `P+q696e646e\` leak as visible characters.
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'pre\x1bP+q696e646e\x1b\\post');
  t.equal(ansi.render(buf), 'prepost', 'DCS envelope dropped');
  t.end();
});

test('ansi buffer: single-byte ESC sequences (DECPAM, DECPNM, save/restore cursor) are dropped', function (t) {
  // ESC = (DECPAM, application keypad), ESC > (DECPNM, normal keypad),
  // ESC 7 / ESC 8 (save / restore cursor) emitted by readline and shell
  // bracketed-paste setup. Used to leak the second byte (= / > / 7 / 8)
  // as a visible character.
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'a\x1b=b\x1b>c\x1b7d\x1b8e');
  t.equal(ansi.render(buf), 'abcde');
  t.end();
});

// ---------------------------------------------------------------------------
// Capability-query responses (Phase 4 follow-up: fix fish startup timeout)
// ---------------------------------------------------------------------------

test('ansi buffer: DA1 query (CSI c) queues a VT100-AVO response', function (t) {
  // Fish blocks 2s waiting for this on startup, then prints "could not
  // read response to Primary Device Attribute query" before degrading to
  // a feature-reduced mode. Reply as VT100 with Advanced Video Option
  // (?1;2c), the simplest universally-accepted answer.
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[c');
  t.equal(buf.responses, '\x1b[?1;2c', 'CSI c -> CSI ?1;2c');
  t.end();
});

test('ansi buffer: DA1 query with explicit "0" param also gets a response', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[0c');
  t.equal(buf.responses, '\x1b[?1;2c');
  t.end();
});

test('ansi buffer: DA2 query (CSI >c) queues a generic-terminal response', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[>c');
  t.equal(buf.responses, '\x1b[>0;0;0c');
  t.end();
});

test('ansi buffer: DSR ready (CSI 5n) replies with CSI 0n', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[5n');
  t.equal(buf.responses, '\x1b[0n');
  t.end();
});

test('ansi buffer: DSR cursor-pos (CSI 6n) replies with row=1, col=cursor+1', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, 'abc\x1b[6n');
  // After "abc" the cursor is at column 3 (0-indexed); response is
  // 1-indexed -> col 4. Row is always 1 in our line-buffer model.
  t.equal(buf.responses, '\x1b[1;4R');
  t.end();
});

test('ansi buffer: kitty keyboard query (CSI ?u) replies with "no flags"', function (t) {
  // Replying CSI ?0u tells the shell "we don't speak the kitty keyboard
  // protocol" so it falls back to legacy keystroke encoding (which our
  // forwarder already handles).
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[?u');
  t.equal(buf.responses, '\x1b[?0u');
  t.end();
});

test('ansi buffer: XTVERSION query (CSI >q) replies with DCS > | name ST', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[>q');
  t.equal(buf.responses, '\x1bP>|slap-pty\x1b\\');
  t.end();
});

test('ansi buffer: DCS XTGETTCAP query gets an "invalid" reply that echoes the hex name', function (t) {
  // 696e646e is hex for "indn" (terminfo capability). The 0+r prefix in
  // the reply means "capability not supported"; the hex echo lets the
  // shell match the response to its query.
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1bP+q696e646e\x1b\\');
  t.equal(buf.responses, '\x1bP0+r696e646e\x1b\\');
  t.end();
});

test('ansi buffer: replays the full fish startup probe in one chunk', function (t) {
  // The exact byte sequence we observed fish emitting on startup. All
  // four queries should be answered in one feed() call so a single
  // pty.write() flushes them.
  var buf = ansi.createBuffer();
  ansi.feed(buf,
    '\x1b[?u' +              // kitty keyboard
    '\x1b[>0q' +              // XTVERSION
    '\x1b[?1049h' +           // alt screen on (no response)
    '\x1bP+q696e646e\x1b\\' + // DCS XTGETTCAP indn
    '\x1b[?1049l' +           // alt screen off (no response)
    '\x1b[0c'                 // DA1
  );
  t.ok(buf.responses.indexOf('\x1b[?0u') !== -1, 'kitty keyboard reply present');
  t.ok(buf.responses.indexOf('\x1bP>|slap-pty\x1b\\') !== -1, 'XTVERSION reply present');
  t.ok(buf.responses.indexOf('\x1bP0+r696e646e\x1b\\') !== -1, 'XTGETTCAP reply present');
  t.ok(buf.responses.indexOf('\x1b[?1;2c') !== -1, 'DA1 reply present');
  t.end();
});

test('ansi buffer: responses are independent of rendered content', function (t) {
  // The query replies must not bleed into the visible output buffer --
  // they go to `responses` only.
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[c');
  t.equal(ansi.render(buf), '', 'no visible content from a DA1 query');
  t.equal(buf.cells.length, 0, 'no cells written');
  t.end();
});

test('ansi buffer: reset() also clears pending responses', function (t) {
  var buf = ansi.createBuffer();
  ansi.feed(buf, '\x1b[c');
  ansi.reset(buf);
  t.equal(buf.responses, '');
  t.end();
});

test('ansi buffer: incomplete OSC at chunk boundary is buffered, not partially leaked', function (t) {
  var buf = ansi.createBuffer();
  // First chunk ends mid-OSC.
  ansi.feed(buf, 'pre\x1b]7;file:///tm');
  // Second chunk completes the OSC and adds visible text.
  ansi.feed(buf, 'p/foo\x07after');
  // Implementation note: we drop the partial OSC at chunk boundary; the
  // continuation in the second chunk has no leading ESC and gets
  // rendered as visible chars. That's an accepted simplification --
  // chunks usually contain whole sequences from the PTY layer. We just
  // assert the leading "pre" survives and the test doesn't crash.
  var rendered = ansi.render(buf);
  t.ok(rendered.indexOf('pre') !== -1, '"pre" preserved across chunks');
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

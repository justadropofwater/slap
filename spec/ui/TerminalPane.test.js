var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var rc = require('rc');
var _ = require('lodash');

var util = require('../../lib/slap-util');
var screenFactory = require('../util').screenFactory;
var Slap = require('../../lib/ui/Slap');
var TerminalPane = require('../../lib/ui/TerminalPane');

function buildSlap() {
  var pkg = require('../../package');
  var configFile = path.join(__dirname, '..', '..', pkg.name + '.ini');
  var opts = util.parseOpts(rc(pkg.name, configFile));
  opts = _.merge(opts, opts.slap);
  opts.screen = screenFactory();
  return new Slap(opts);
}

test('TerminalPane: created on slap, hidden by default, sized from config', function (t) {
  var slap = buildSlap();
  t.ok(slap.terminal instanceof TerminalPane, 'slap.terminal exists');
  t.equal(slap.terminal.hidden, true, 'starts hidden');
  t.equal(slap.terminal.height, 12, 'reads height from slap.ini default');
  t.ok(slap.terminal.scrollback, 'has a scrollback widget');
  t.ok(slap.terminal.input, 'has an input field');
  t.equal(typeof slap.terminal.runCommand, 'function', 'exposes runCommand()');
  slap.quit();
  t.end();
});

test('TerminalPane: runCommand spawns subprocess, captures stdout, surfaces exit code 0', function (t) {
  t.plan(3);
  var slap = buildSlap();
  slap.terminal.runCommand('echo hello-from-slap-terminal').then(function (code) {
    t.equal(code, 0, 'exit code 0');
    var content = slap.terminal.scrollback.content || '';
    t.ok(content.indexOf('hello-from-slap-terminal') !== -1, 'stdout in scrollback');
    t.ok(content.indexOf('[exit 0]') !== -1, 'exit marker appended');
    slap.quit();
  }).catch(function (err) { t.fail(err.message); slap.quit(); });
});

test('TerminalPane: failed command surfaces non-zero exit code', function (t) {
  t.plan(2);
  var slap = buildSlap();
  slap.terminal.runCommand('exit 42').then(function (code) {
    t.equal(code, 42, 'exit code propagates');
    var content = slap.terminal.scrollback.content || '';
    t.ok(content.indexOf('[exit 42]') !== -1, 'exit marker shows 42');
    slap.quit();
  }).catch(function (err) { t.fail(err.message); slap.quit(); });
});

test('TerminalPane: stderr also lands in scrollback', function (t) {
  t.plan(1);
  var slap = buildSlap();
  slap.terminal.runCommand('printf err-msg 1>&2').then(function () {
    var content = slap.terminal.scrollback.content || '';
    t.ok(content.indexOf('err-msg') !== -1, 'stderr captured');
    slap.quit();
  }).catch(function (err) { t.fail(err.message); slap.quit(); });
});

test('TerminalPane: refusing overlapping invocations', function (t) {
  t.plan(2);
  var slap = buildSlap();
  var first = slap.terminal.runCommand('sleep 0.05');
  slap.terminal.runCommand('echo overlap').then(function () {
    t.fail('overlapping command unexpectedly resolved');
    slap.quit();
  }).catch(function (err) {
    t.ok(/already running/.test(err.message), 'second invocation rejected');
    return first;
  }).then(function (code) {
    t.equal(code, 0, 'first invocation eventually resolves');
    slap.quit();
  });
});

test('TerminalPane: toggle flips visibility and resizes panes', function (t) {
  var slap = buildSlap();
  var EditorPane = require('../../lib/ui/EditorPane');
  var pane = new EditorPane({ parent: slap });

  var headerBottom = slap.header.options.headerPosition === 'bottom' ? 1 : 0;
  t.equal(pane.position.bottom, headerBottom, 'pane bottom starts at headerBottom');

  slap._toggleTerminal();
  t.equal(slap.terminal.visible, true, 'terminal visible after toggle');
  t.equal(pane.bottom, slap.terminal.height, 'pane bottom expanded');

  slap._toggleTerminal();
  t.equal(slap.terminal.visible, false, 'terminal hidden after second toggle');
  t.equal(pane.bottom, headerBottom, 'pane bottom restored');

  slap.quit();
  t.end();
});

test('TerminalPane integration: cat\'ing a file with literal braces does not crash blessed (regression)', function (t) {
  // Regression for the v1.1.0 crash where `cat README.md` blew up inside
  // blessed's program._attr because slap's own README contains literal
  // {Ctrl+S} / {green-bg} text that scrollback (tags: true) tried to parse
  // as markup. The fix: subprocess output goes through ansi.chunkToTags
  // which escapes `{` and `}` to `{open}` / `{close}`.
  t.plan(4);
  var slap = buildSlap();

  var fixture = path.join(os.tmpdir(), 'slap-terminal-braces-' + Date.now() + '.txt');
  // Mix of patterns that previously crashed: known blessed style names,
  // unknown style names, and bare braces.
  var contents = [
    '# Slap test fixture',
    '',
    'Save: {Ctrl+S}    Quit: {Ctrl+Q}',
    'Style: {green-bg}highlight{/green-bg} or {bold}bold{/bold}',
    'Bare braces: { and } and {{ }} should round-trip',
    'Unknown tag {not-a-color} stays literal',
    ''
  ].join('\n');
  fs.writeFileSync(fixture, contents);

  var thrown = null;
  process.once('uncaughtException', function (err) { thrown = err; });

  slap.terminal.runCommand('cat ' + JSON.stringify(fixture)).then(function (code) {
    t.equal(thrown, null, 'no uncaughtException from blessed tag parser');
    t.equal(code, 0, 'cat exits 0');

    var rendered = slap.terminal.scrollback.content || '';
    // `{open}` / `{close}` is what ansi.chunkToTags emits for literal `{` `}`.
    t.ok(rendered.indexOf('{open}Ctrl+S{close}') !== -1,
      'literal {Ctrl+S} survived as {open}Ctrl+S{close}');
    t.ok(rendered.indexOf('{open}not-a-color{close}') !== -1,
      'unknown tag-like text was escaped, not interpreted');

    fs.unlinkSync(fixture);
    slap.quit();
  }).catch(function (err) {
    t.fail('runCommand rejected: ' + (err.stack || err));
    try { fs.unlinkSync(fixture); } catch (e) {}
    slap.quit();
  });
});

test('TerminalPane integration: SGR colors in subprocess output render as blessed tags', function (t) {
  t.plan(2);
  var slap = buildSlap();
  // Use printf so the ESC byte is emitted regardless of the shell.
  slap.terminal.runCommand("printf '\\033[31mRED-WORD\\033[0m done'").then(function (code) {
    t.equal(code, 0, 'printf exits 0');
    var rendered = slap.terminal.scrollback.content || '';
    t.ok(rendered.indexOf('{red-fg}') !== -1 && rendered.indexOf('RED-WORD') !== -1,
      'SGR red foreground rendered as a {red-fg} tag around the word');
    slap.quit();
  });
});

test('TerminalPane integration: stdout and stderr maintain independent SGR state', function (t) {
  t.plan(2);
  var slap = buildSlap();
  // stdout opens green and never closes; stderr opens red and never closes.
  // Each stream's state must be kept separate -- otherwise stdout's green
  // would bleed onto stderr or vice versa.
  slap.terminal.runCommand(
    "printf '\\033[32mgreen-on-stdout' && printf '\\033[31mred-on-stderr' 1>&2"
  ).then(function (code) {
    t.equal(code, 0, 'command exits 0');
    var rendered = slap.terminal.scrollback.content || '';
    var hasGreen = rendered.indexOf('{green-fg}') !== -1;
    var hasRed = rendered.indexOf('{red-fg}') !== -1;
    t.ok(hasGreen && hasRed, 'both streams contributed their own colors');
    slap.quit();
  });
});

test('TerminalPane: history navigation cycles through past commands', function (t) {
  t.plan(4);
  var slap = buildSlap();
  var t1 = slap.terminal;
  // Seed history without actually running anything.
  t1.history.push('first');
  t1.history.push('second');
  t1._historyIndex = t1.history.length;

  function press(name) {
    t1.input.emit('keypress', '', { full: name, name: name, ctrl: false });
  }

  // _initHandlers runs in a setImmediate callback inside the BaseWidget
  // ready chain; wait for it before firing synthetic keypress events.
  t1.ready.then(function () {
    press('up');
    t.equal(t1.input.textBuf.getText(), 'second', 'first up shows last command');
    press('up');
    t.equal(t1.input.textBuf.getText(), 'first', 'second up shows older command');
    press('down');
    t.equal(t1.input.textBuf.getText(), 'second', 'down moves forward');
    press('down');
    t.equal(t1.input.textBuf.getText(), '', 'down past end clears input');
    slap.quit();
  });
});

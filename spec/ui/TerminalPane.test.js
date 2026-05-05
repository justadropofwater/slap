var test = require('tape');
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

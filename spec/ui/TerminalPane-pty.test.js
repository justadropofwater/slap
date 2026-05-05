var test = require('tape');
var path = require('path');
var rc = require('rc');
var _ = require('lodash');

var util = require('../../lib/slap-util');
var screenFactory = require('../util').screenFactory;
var Slap = require('../../lib/ui/Slap');

function buildSlap() {
  var pkg = require('../../package');
  var configFile = path.join(__dirname, '..', '..', pkg.name + '.ini');
  var opts = util.parseOpts(rc(pkg.name, configFile));
  opts = _.merge(opts, opts.slap);
  opts.screen = screenFactory();
  return new Slap(opts);
}

test('TerminalPane PTY: node-pty loads', function (t) {
  var pty;
  try { pty = require('node-pty'); }
  catch (e) { t.fail('node-pty failed to load: ' + e.message); return t.end(); }
  t.equal(typeof pty.spawn, 'function', 'pty.spawn is a function');
  t.end();
});

test('TerminalPane PTY: enterShellMode swaps subprocess UI for PTY', function (t) {
  t.plan(5);
  var slap = buildSlap();
  var term = slap.terminal;

  t.equal(term.shellMode, false, 'starts in subprocess mode');
  t.equal(term.pty, null, 'no pty handle yet');

  term.enterShellMode();

  t.equal(term.shellMode, true, 'shellMode set');
  t.ok(term.pty, 'pty handle created');
  t.ok(term.shellPane, 'shellPane child widget created');

  // Wait briefly for the shell prompt, then exit.
  setTimeout(function () {
    term.exitShellMode();
    slap.quit();
  }, 200);
});

test('TerminalPane PTY: exitShellMode tears down the PTY and restores subprocess UI', function (t) {
  t.plan(4);
  var slap = buildSlap();
  var term = slap.terminal;
  term.enterShellMode();
  setTimeout(function () {
    term.exitShellMode();
    t.equal(term.shellMode, false, 'shellMode cleared');
    t.equal(term.pty, null, 'pty handle nulled');
    t.equal(term.shellPane, null, 'shellPane detached');
    t.equal(term.input.hidden, false, 'input field re-shown');
    slap.quit();
  }, 200);
});

test('TerminalPane PTY: shell echoes a simple write', function (t) {
  t.plan(1);
  // Force /bin/sh so the test isn't at the mercy of whatever the user's
  // SHELL is (zsh, fish, etc. may have slow rc files that race the timeout).
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;
  term.enterShellMode();

  var done = false;
  function finish(ok) {
    if (done) return;
    done = true;
    process.env.SHELL = prevShell;
    t.ok(ok, 'echo output reached scrollback');
    try { term.exitShellMode(); } catch (e) {}
    try { slap.quit(); } catch (e) {}
  }

  // Poll for the expected output up to 2s.
  var attempts = 0;
  function poll() {
    var got = term._shellContent || '';
    if (got.indexOf('from-pty-test') !== -1) return finish(true);
    if (++attempts > 40) return finish(false);
    setTimeout(poll, 50);
  }

  setTimeout(function () {
    if (term.pty) term.pty.write('echo from-pty-test\n');
    poll();
  }, 100);
});

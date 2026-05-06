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

// Tests can't use slap.quit() because it schedules a process.exit(0) on a
// 200ms timer, which kills the tape runner mid-suite. teardown() kills any
// live PTY synchronously and detaches the screen so widget event handlers
// that fire late don't crash the next test.
function teardown(slap) {
  try {
    if (slap.terminal && slap.terminal._pty) {
      slap.terminal._pty.kill();
      slap.terminal._pty = null;
    }
  } catch (e) {}
  try { slap.detach(); } catch (e) {}
  try { slap.screen.destroy(); } catch (e) {}
}

function pollFor(predicate, timeoutMs, intervalMs) {
  timeoutMs = timeoutMs || 2000;
  intervalMs = intervalMs || 25;
  return new Promise(function (resolve, reject) {
    var elapsed = 0;
    function tick() {
      if (predicate()) return resolve();
      elapsed += intervalMs;
      if (elapsed >= timeoutMs) return reject(new Error('timed out after ' + timeoutMs + 'ms'));
      setTimeout(tick, intervalMs);
    }
    tick();
  });
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

test('TerminalPane: constructed on slap, hidden, focusable, sized from config', function (t) {
  var slap = buildSlap();
  t.ok(slap.terminal instanceof TerminalPane, 'slap.terminal exists');
  t.equal(slap.terminal.hidden, true, 'starts hidden');
  t.equal(slap.terminal.focusable, true, 'pane is focusable so keys can route to it');
  t.equal(slap.terminal.height, 12, 'reads height from slap.ini default');
  t.ok(slap.terminal.view, 'has a single view widget');
  t.equal(slap.terminal._pty, null, 'PTY not spawned until first show');
  t.equal(typeof slap.terminal.toggle, 'function', 'exposes toggle()');
  t.equal(typeof slap.terminal.write, 'function', 'exposes write()');
  t.equal(typeof slap.terminal.resize, 'function', 'exposes resize()');
  // Subprocess-era surface area is gone:
  t.equal(slap.terminal.scrollback, undefined, 'no scrollback widget');
  t.equal(slap.terminal.input, undefined, 'no input field');
  t.equal(slap.terminal.runCommand, undefined, 'no runCommand');
  t.equal(slap.terminal.toggleShell, undefined, 'no shell-mode toggle');
  teardown(slap);
  t.end();
});

// ---------------------------------------------------------------------------
// PTY lifecycle
// ---------------------------------------------------------------------------

test('TerminalPane: show() lazily spawns the PTY and survives hide/show', function (t) {
  t.plan(4);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;
  t.equal(term._pty, null, 'no PTY before show');

  term.show();
  t.ok(term._pty, 'PTY spawned on show');
  var firstPty = term._pty;

  term.hide();
  t.equal(term._pty, firstPty, 'PTY persists across hide');

  term.show();
  t.equal(term._pty, firstPty, 'PTY still the same instance after show again');

  process.env.SHELL = prevShell;
  teardown(slap);
});

test('TerminalPane: PTY exit emits "[shell exited" marker and clears handle', function (t) {
  t.plan(2);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;
  term.show();
  // exit immediately
  term._pty.write('exit 0\n');

  pollFor(function () { return term._pty === null; }, 3000)
    .then(function () {
      t.equal(term._pty, null, 'PTY handle cleared on exit');
      t.ok(/shell exited/.test(slap.terminal.view.content || ''),
        'shell-exited marker rendered into view');
      process.env.SHELL = prevShell;
      teardown(slap);
    })
    .catch(function (err) {
      t.fail(err.message);
      process.env.SHELL = prevShell;
      teardown(slap);
    });
});

// ---------------------------------------------------------------------------
// Echo loop and the ACTUAL feature: tab completion
// ---------------------------------------------------------------------------

test('TerminalPane: echo loop -- shell sees and echoes back', function (t) {
  t.plan(1);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;
  term.show();
  term.write('echo from-pty-test\n');

  pollFor(function () {
    var v = term.view.content || '';
    return v.indexOf('from-pty-test') !== -1;
  }, 2000)
    .then(function () { t.pass('echo output reached the rendered view'); })
    .catch(function (err) { t.fail(err.message); })
    .then(function () {
      process.env.SHELL = prevShell;
      teardown(slap);
    });
});

test('TerminalPane integration: tab completes a partial filename (the user feature)', function (t) {
  t.plan(1);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  // Build a temp dir whose only entry starts with "REA" so the shell has
  // exactly one possible completion. Avoids shell rc files affecting the
  // candidate set.
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slap-tab-'));
  fs.writeFileSync(path.join(dir, 'README.md'), '# slap test fixture\n');

  var slap = buildSlap();
  var term = slap.terminal;
  term.cwd = dir;
  term.show();

  // Wait for the prompt to settle, then type `cat REA<Tab>`.
  setTimeout(function () {
    term.write('cat REA\t');
    pollFor(function () {
      var v = term.view.content || '';
      // Shell echoes back the typed prefix and the completed suffix once
      // readline finishes the unique completion. Looking for "README.md"
      // anywhere in the rendered view is sufficient.
      return v.indexOf('README.md') !== -1;
    }, 3000)
      .then(function () { t.pass('shell tab-completed REA -> README.md'); })
      .catch(function (err) { t.fail('completion did not appear: ' + err.message); })
      .then(function () {
        process.env.SHELL = prevShell;
        teardown(slap);
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
      });
  }, 200);
});

// ---------------------------------------------------------------------------
// Layout & focus
// ---------------------------------------------------------------------------

test('TerminalPane regression: clicking on the view does not throw "no focusable descendant"', function (t) {
  // The crash trace from a real ./slap.js README.md run:
  //
  //   Error: no focusable descendant
  //     at BaseWidget._focusDirection (.../BaseWidget.js:76)
  //     at BaseWidget.focusNext (.../BaseWidget.js:80)
  //     at BaseWidget.<anonymous> (.../BaseWidget.js:136)
  //     at Screen.focusPush (.../blessed/lib/widgets/screen.js:1620)
  //
  // Root cause: blessed focuses the inner view widget on click; if view
  // is a BaseWidget without focusable: true, BaseWidget._initHandlers'
  // focus listener calls focusNext() which walks an empty subtree and
  // throws. Fix: view is a plain blessed.Box (skips the BaseWidget
  // focus-bouncing logic entirely) and is itself focusable.
  t.plan(3);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;
  term.show();

  var thrown = null;
  process.once('uncaughtException', function (err) { thrown = err; });

  // Simulate the focus-on-click path that blessed runs internally when
  // the user clicks on a `mouse: true` widget.
  t.doesNotThrow(function () { term.view.focus(); }, 'view.focus() does not throw');
  t.equal(thrown, null, 'no uncaughtException');
  t.ok(term.hasFocus(), 'terminal.hasFocus() true even with view as the focused element (descendant)');

  process.env.SHELL = prevShell;
  teardown(slap);
});

test('TerminalPane: keys forwarded to PTY whether the view or the pane is focused', function (t) {
  t.plan(2);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;
  term.show();

  // _initHandlers (which registers the keypress forwarder) is scheduled
  // via setImmediate inside BaseWidget._initBaseWidget's ready chain.
  // Wait for it before firing synthetic keypress events.
  term.ready.then(function () {
    var written = [];
    var realWrite = term._pty.write.bind(term._pty);
    term._pty.write = function (d) { written.push(d); return realWrite(d); };

    term.view.focus();
    term.view.emit('keypress', 'X', { full: 'x', name: 'x', ctrl: false, sequence: 'X' });
    t.equal(written.pop(), 'X', 'keypress on view forwards to PTY');

    term.focus();
    term.emit('keypress', 'Y', { full: 'y', name: 'y', ctrl: false, sequence: 'Y' });
    t.equal(written.pop(), 'Y', 'keypress on pane forwards to PTY too (belt-and-braces)');

    process.env.SHELL = prevShell;
    teardown(slap);
  });
});

test('TerminalPane: toggle flips visibility, resizes panes, moves focus to/from terminal', function (t) {
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var EditorPane = require('../../lib/ui/EditorPane');
  var pane = new EditorPane({ parent: slap });
  pane.setCurrent();

  var headerBottom = slap.header.options.headerPosition === 'bottom' ? 1 : 0;
  t.equal(pane.bottom, headerBottom, 'pane bottom starts at headerBottom');

  slap._toggleTerminal();
  t.equal(slap.terminal.visible, true, 'terminal visible after toggle');
  t.equal(pane.bottom, slap.terminal.height, 'editor pane shrinks to make room');
  t.ok(slap.terminal.hasFocus(), 'focus transferred into terminal pane');

  slap._toggleTerminal();
  t.equal(slap.terminal.visible, false, 'terminal hidden after second toggle');
  t.equal(pane.bottom, headerBottom, 'editor pane bottom restored');
  t.ok(pane.hasFocus(), 'focus returned to editor pane');

  process.env.SHELL = prevShell;
  teardown(slap);
  t.end();
});

test('TerminalPane: resize() forwards cols/rows to the live PTY', function (t) {
  t.plan(2);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;
  term.show();

  var resizeCalls = [];
  var realResize = term._pty.resize.bind(term._pty);
  term._pty.resize = function (c, r) { resizeCalls.push([c, r]); return realResize(c, r); };

  term.resize(100, 30);
  t.deepEqual(resizeCalls.pop(), [100, 30], 'resize(100,30) reaches PTY.resize');
  term.resize(0, 0);
  t.equal(resizeCalls.length, 0, 'resize(0,0) is a no-op (guards against bad sizes)');

  process.env.SHELL = prevShell;
  teardown(slap);
});

// ---------------------------------------------------------------------------
// Slap-level key gating
// ---------------------------------------------------------------------------

test('Slap element-keypress: ignores its own bindings while terminal has focus, except toggleTerminal', function (t) {
  t.plan(3);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var slap = buildSlap();
  var term = slap.terminal;

  // Slap._initHandlers is registered in a setImmediate-scheduled callback
  // (via BaseWidget._initBaseWidget's ready chain). Wait for that before
  // simulating element-keypress events.
  slap.ready.then(function () {
    var helpCalled = 0;
    slap.help = function () { helpCalled++; return Promise.resolve(); };
    var origToggle = slap._toggleTerminal.bind(slap);
    var toggleCalls = 0;
    slap._toggleTerminal = function () { toggleCalls++; return origToggle(); };

    function fakeKey(name) {
      return { full: name, name: name, ctrl: false };
    }

    // Terminal hidden -> help fires normally.
    slap.emit('element keypress', slap, '', fakeKey('f2'));
    t.equal(helpCalled, 1, 'F2 triggers help when terminal is not focused');

    // Open terminal -> focus moves into it.
    origToggle();
    toggleCalls = 0;

    // F2 should be suppressed by the new gate.
    slap.emit('element keypress', slap, '', fakeKey('f2'));
    t.equal(helpCalled, 1, 'F2 is suppressed while terminal has focus');

    // F12 still toggles (escape hatch).
    slap.emit('element keypress', slap, '', fakeKey('f12'));
    t.equal(toggleCalls, 1, 'F12 still hides the terminal even when terminal has focus');

    process.env.SHELL = prevShell;
    teardown(slap);
  });
});

// ---------------------------------------------------------------------------
// Brace-escape regression (carried over from the v1.1.0 pre-Phase-4 fix)
// ---------------------------------------------------------------------------

test('TerminalPane regression: cat\'ing a file with literal blessed braces does not crash', function (t) {
  t.plan(2);
  var prevShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';

  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slap-braces-'));
  var fixture = path.join(dir, 'has-braces.txt');
  fs.writeFileSync(fixture, [
    '# Slap test fixture',
    'Save: {Ctrl+S}    Quit: {Ctrl+Q}',
    'Style: {green-bg}highlight{/green-bg} or {bold}bold{/bold}',
    'Bare braces: { and } and {{ }} should round-trip',
    'Unknown tag {not-a-color} stays literal',
    ''
  ].join('\n'));

  var slap = buildSlap();
  var term = slap.terminal;
  term.cwd = dir;

  var thrown = null;
  process.once('uncaughtException', function (err) { thrown = err; });

  term.show();
  term.write('cat ' + JSON.stringify(fixture) + '\n');

  pollFor(function () {
    var v = term.view.content || '';
    return v.indexOf('Unknown tag') !== -1;
  }, 3000)
    .then(function () {
      t.equal(thrown, null, 'no uncaughtException from blessed tag parser');
      var v = term.view.content || '';
      t.ok(v.indexOf('{open}Ctrl+S{close}') !== -1 || v.indexOf('Ctrl+S') !== -1,
        'literal {Ctrl+S} survived without crashing the parser');
    })
    .catch(function (err) { t.fail('cat output never landed: ' + err.message); })
    .then(function () {
      process.env.SHELL = prevShell;
      teardown(slap);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    });
});

var _ = require('lodash');
var pty = require('node-pty');

var BaseWidget = require('./BaseWidget');
var ansi = require('../ansi-render');

// TerminalPane is a singleton bottom-split pane (alongside fileBrowser, NOT a
// tab-pane in slap.panes) that hosts a persistent PTY-backed shell.
//
// All keys typed while the pane has focus go to the PTY -- which means the
// user's shell does tab completion, history walks, vi/emacs line editing,
// custom completion functions, signal handling (Ctrl-C / Ctrl-Z), and so on.
// The only exception is F12, which bubbles up to slap's `toggleTerminal`
// binding so the user can hide the pane.
//
// Output from the PTY is fed through ansi-render's line-buffer model and
// rendered into a single `view` widget (blessed Box with tags + scroll). See
// lib/ansi-render.js for what the renderer handles and what it intentionally
// drops (full TUI apps like vim/htop/less still won't render correctly --
// they need a cell-grid renderer with alternate-screen-buffer support).

class TerminalPane extends BaseWidget {
  constructor(opts) {
    var slap = Slap.global;
    var headerAtBottom = slap.header.options.headerPosition === 'bottom';
    var defaultHeight = (slap.options.terminal && slap.options.terminal.height) || 12;

    super(_.merge({
      hidden: true,
      focusable: true,
      left: 0,
      right: 0,
      bottom: headerAtBottom ? 1 : 0,
      height: defaultHeight,
    }, slap.options.terminal, opts));

    var self = this;
    self._pty = null;
    self._buf = ansi.createBuffer();
    self.cwd = process.cwd();

    // The render surface is a plain blessed.Box, deliberately NOT a
    // BaseWidget. BaseWidget's _initHandlers registers a 'focus' listener
    // that calls focusNext() on any non-focusable widget that receives
    // focus -- which is exactly what blessed does when the user clicks on
    // a `mouse: true` element. With nothing focusable in view's subtree,
    // focusNext walks up to view's own focusFirst() and throws "no
    // focusable descendant". Using blessed.Box skips that whole behavior;
    // we make the box itself focusable so a click leaves focus there
    // (and our keypress handler below picks it up), and the slap-side
    // element-keypress gate uses terminal.hasFocus() which returns true
    // for any descendant focus -- so keys still get suppressed at slap
    // and forwarded to the PTY.
    self.view = new BaseWidget.blessed.Box({
      parent: self,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      focusable: true,
      keys: false,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      style: self.options.style || {},
    });
  }

  // Public API -------------------------------------------------------------

  show() {
    var self = this;
    self._ensurePty();
    var result = super.show.apply(self, arguments);
    self._syncSize();
    if (self.screen) self.screen.render();
    return result;
  }

  hide() {
    return super.hide.apply(this, arguments);
  }

  toggle() {
    return this.visible ? this.hide() : this.show();
  }

  // Write raw bytes to the PTY. Exposed for tests; callers in slap should
  // generally rely on key forwarding rather than poking the PTY directly.
  write(data) {
    if (this._pty) this._pty.write(data);
  }

  resize(cols, rows) {
    if (this._pty && cols > 0 && rows > 0) {
      try { this._pty.resize(cols, rows); } catch (e) { /* PTY may already be exiting */ }
    }
  }

  // Internal ---------------------------------------------------------------

  _ensurePty() {
    var self = this;
    if (self._pty) return self._pty;

    var cols = (self.screen && self.screen.cols) || 80;
    var rows = self._currentPtyRows();

    self._pty = pty.spawn(process.env.SHELL || '/bin/sh', [], {
      name: 'xterm-256color',
      cols: cols,
      rows: rows,
      cwd: self.cwd,
      env: process.env,
    });

    self._pty.onData(function (data) {
      ansi.feed(self._buf, data);
      self.view.setContent(ansi.render(self._buf));
      self.view.setScrollPerc(100);
      if (self.screen) self.screen.render();
    });

    self._pty.onExit(function () {
      self._pty = null;
      ansi.feed(self._buf, '\n[shell exited; press F12 to reopen]\n');
      self.view.setContent(ansi.render(self._buf));
      if (self.screen) self.screen.render();
    });

    return self._pty;
  }

  _syncSize() {
    var self = this;
    if (!self._pty) return;
    var cols = (self.screen && self.screen.cols) || self.width || 80;
    var rows = self._currentPtyRows();
    self.resize(cols, rows);
  }

  _currentPtyRows() {
    return Math.max(2, this.height || 12);
  }

  _initHandlers() {
    var self = this;

    // Forward every key the focused view sees to the PTY. The handler is
    // on `view` (not on the pane itself) because that's what blessed
    // focuses on mouse click and it's where blessed dispatches keypress
    // events. F12 is the one exception we don't forward: returning here
    // lets it bubble up to slap's global toggleTerminal binding so the
    // user can dismiss the pane. Returning false on every other key stops
    // further listeners on this `keypress` emitter -- we don't want any
    // default blessed handling.
    function forwardKey(ch, key) {
      if (key && key.full === 'f12') return;
      if (self._pty) {
        self._pty.write(key && key.sequence != null ? key.sequence : (ch || ''));
      }
      return false;
    }
    self.view.on('keypress', forwardKey);
    // Belt-and-braces: the pane itself can also be the focused element
    // briefly during _toggleTerminal before focus settles on view. Forward
    // anything that fires on the pane too.
    self.on('keypress', forwardKey);

    // Re-sync PTY size whenever the screen size changes.
    if (self.screen) {
      self._onScreenResize = function () { self._syncSize(); };
      self.screen.on('resize', self._onScreenResize);
    }

    // Standard BaseWidget hooks (show -> setFront for layering) but
    // deliberately NOT super._initHandlers' `element keypress`
    // focus-traversal handler. Tab and Shift-Tab while the terminal pane
    // is focused must go to the PTY for shell completion / history -- if
    // we chained to super, BaseWidget would resolve Tab to focusNext and
    // walk away from the pane.
    self.on('show', function () { self.setFront(); });
  }
}

module.exports = TerminalPane;

var Slap = require('./Slap');

var _ = require('lodash');
var spawn = require('child_process').spawn;

var BaseWidget = require('./BaseWidget');
var util = require('../slap-util');
var ansi = require('../ansi-render');
var Editor = require('editor-widget');
var Field = Editor.Field;

// node-pty is only required when shell mode is engaged (Phase 3). Lazy-load
// so plain subprocess mode keeps working even if node-pty's native build
// fails on a given platform.
var _ptyMod = null;
function loadPty() {
  if (_ptyMod === null) {
    try { _ptyMod = require('node-pty'); }
    catch (e) { _ptyMod = false; }
  }
  return _ptyMod;
}

var ANSI_REGEX = /\x1b\[[0-9;?]*[a-zA-Z]/g;
function stripAnsi(s) { return s.replace(ANSI_REGEX, ''); }

class TerminalPane extends BaseWidget {
  constructor(opts) {
    var slap = Slap.global;
    var headerAtBottom = slap.header.options.headerPosition === 'bottom';
    var defaultHeight = (slap.options.terminal && slap.options.terminal.height) || 12;

    super(_.merge({
      hidden: true,
      left: 0,
      right: 0,
      bottom: headerAtBottom ? 1 : 0,
      height: defaultHeight,
    }, slap.options.terminal, opts));

    var self = this;
    self.history = [];
    self._historyIndex = -1;
    self.cwd = process.cwd();
    self.activeChild = null;

    var promptText = self.options.prompt || '$ ';
    var promptStyle = (self.options.style && self.options.style.prompt) || '';

    self.scrollback = new BaseWidget({
      parent: self,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: false,
      top: 0,
      left: 0,
      right: 0,
      bottom: 1,
      style: self.options.style || {},
    });

    self.promptLabel = new BaseWidget({
      parent: self,
      tags: true,
      bottom: 0,
      left: 0,
      width: promptText.length,
      height: 1,
      content: util.markup(promptText, promptStyle).toString(),
      style: self.options.style || {},
    });

    self.input = new Field({
      parent: self,
      bottom: 0,
      left: promptText.length,
      right: 0,
      height: 1,
    });

    // Shell-mode (PTY) state. The shell pane is created lazily on first
    // toggleShell; until then the subprocess UI above is the only visible
    // surface.
    self.shellMode = false;
    self.shellPane = null;
    self.pty = null;
    self._ansiState = ansi._initialState();
    self._shellContent = '';
  }

  appendLine(line) {
    var prev = this.scrollback.content || '';
    this.scrollback.setContent(prev + (prev ? '\n' : '') + line);
    this.scrollback.setScrollPerc(100);
    if (this.screen) this.screen.render();
  }

  runCommand(command) {
    var self = this;
    if (!command) return Promise.resolve(0);
    if (self.activeChild) {
      // Naive: queue not supported; reject overlapping invocations.
      return Promise.reject(new Error('a command is already running'));
    }

    var promptStyle = (self.options.style && self.options.style.prompt) || '';
    var displayed = util.markup((self.options.prompt || '$ ') + command, promptStyle).toString();
    self.appendLine(displayed);
    self.history.push(command);
    self._historyIndex = self.history.length;

    return new Promise(function (resolve) {
      var child;
      try {
        child = spawn(command, {
          shell: true,
          cwd: self.cwd,
          env: process.env,
        });
      } catch (err) {
        self.appendLine('error: ' + err.message);
        return resolve(1);
      }
      self.activeChild = child;

      function streamLines(buf) {
        buf.toString().replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
          .forEach(function (line) { self.appendLine(stripAnsi(line)); });
      }

      child.stdout.on('data', streamLines);
      child.stderr.on('data', streamLines);

      child.on('error', function (err) {
        self.activeChild = null;
        self.appendLine('error: ' + err.message);
        resolve(1);
      });

      child.on('close', function (code, signal) {
        self.activeChild = null;
        var msg = signal ? '[signal ' + signal + ']' : '[exit ' + (code || 0) + ']';
        var exitStyle = (self.options.style && self.options.style.exitCode) || '';
        self.appendLine(util.markup(msg, exitStyle).toString());
        resolve(code || 0);
      });
    });
  }

  cancelCommand() {
    if (this.activeChild) {
      try { this.activeChild.kill('SIGINT'); } catch (e) {}
    }
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
    return this;
  }

  toggleShell() {
    var self = this;
    var pty = loadPty();
    if (!pty) {
      self.appendLine('shell mode unavailable (node-pty failed to load)');
      return self;
    }
    if (self.shellMode) {
      self.exitShellMode();
    } else {
      self.enterShellMode();
    }
    return self;
  }

  enterShellMode() {
    var self = this;
    if (self.shellMode) return self;
    var pty = loadPty();
    if (!pty) return self;

    self.shellMode = true;
    self._ansiState = ansi._initialState();
    self._shellContent = '';
    self.scrollback.hide();
    self.promptLabel.hide();
    self.input.hide();

    self.shellPane = new BaseWidget({
      parent: self,
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: false,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      style: self.options.style || {},
    });

    var cwd = self.cwd;
    var screenSize = self.screen ? { cols: self.screen.cols, rows: self.height } : { cols: 80, rows: self.height };
    self.pty = pty.spawn(process.env.SHELL || '/bin/sh', [], {
      name: 'xterm-256color',
      cols: screenSize.cols || 80,
      rows: Math.max(2, (screenSize.rows || self.height) - 1),
      cwd: cwd,
      env: process.env,
    });

    self.pty.onData(function (data) {
      var result = ansi.chunkToTags(data, self._ansiState);
      self._ansiState = result[1];
      self._shellContent += result[0];
      // Cap scrollback to last ~2000 lines to keep render cheap.
      var lines = self._shellContent.split('\n');
      if (lines.length > 2000) self._shellContent = lines.slice(-2000).join('\n');
      self.shellPane.setContent(self._shellContent);
      self.shellPane.setScrollPerc(100);
      if (self.screen) self.screen.render();
    });

    self.pty.onExit(function () {
      self.exitShellMode();
    });

    self._shellKeyHandler = function (ch, key) {
      if (!self.shellMode || !self.pty) return;
      // M-s exits shell mode; everything else goes to the PTY.
      if (key && key.full === 'M-s') {
        self.toggleShell();
        return;
      }
      var write = key && key.sequence ? key.sequence : (ch || '');
      if (write) self.pty.write(write);
    };
    if (self.screen) self.screen.on('keypress', self._shellKeyHandler);
    self.shellPane.show();
    self.shellPane.focus();
    if (self.screen) self.screen.render();
    return self;
  }

  exitShellMode() {
    var self = this;
    if (!self.shellMode) return self;
    self.shellMode = false;
    if (self.pty) {
      try { self.pty.kill(); } catch (e) {}
      self.pty = null;
    }
    if (self._shellKeyHandler && self.screen) {
      self.screen.removeListener('keypress', self._shellKeyHandler);
      self._shellKeyHandler = null;
    }
    if (self.shellPane) {
      self.shellPane.detach();
      self.shellPane = null;
    }
    self.scrollback.show();
    self.promptLabel.show();
    self.input.show();
    self.input.focus();
    if (self.screen) self.screen.render();
    return self;
  }

  _initHandlers() {
    var self = this;

    self.input.on('submit', function (text) {
      self.input.textBuf.setText('');
      self.input.selection.setHeadPosition([0, 0]);
      self.input._updateContent();
      self.runCommand(text).then(function () {
        if (self.visible) self.input.focus();
      }, function (err) {
        self.appendLine('error: ' + (err.message || err));
        if (self.visible) self.input.focus();
      });
    });

    self.input.on('cancel', function () {
      // Fall back to the current pane (or fileBrowser) on Esc.
      var slap = self.screen.slap;
      var current = slap.getCurrentPane();
      if (current) current.focus();
      else if (slap.fileBrowser.visible) slap.fileBrowser.focus();
    });

    self.input.on('keypress', function (ch, key) {
      // M-s (Alt+s) toggles real-PTY shell mode while the input is focused.
      // F2 is reserved for slap's global help binding.
      if (key.full === 'M-s') {
        self.toggleShell();
        return;
      }
      // Up/Down history navigation while the input field is focused.
      if (key.full === 'up') {
        if (!self.history.length) return;
        self._historyIndex = Math.max(0, self._historyIndex - 1);
        self.input.textBuf.setText(self.history[self._historyIndex] || '');
        self.input.selection.setHeadPosition([0, Infinity]);
        self.input._updateContent();
      } else if (key.full === 'down') {
        if (!self.history.length) return;
        self._historyIndex = Math.min(self.history.length, self._historyIndex + 1);
        var next = self._historyIndex >= self.history.length ? '' : self.history[self._historyIndex];
        self.input.textBuf.setText(next || '');
        self.input.selection.setHeadPosition([0, Infinity]);
        self.input._updateContent();
      } else if (key.ctrl && key.name === 'c') {
        // Ctrl-C: kill running child, clear input.
        self.cancelCommand();
        self.input.textBuf.setText('');
        self.input._updateContent();
      }
    });

    self.on('show', function () { self.input.focus(); });

    return super._initHandlers.apply(self, arguments);
  }
}

module.exports = TerminalPane;

var Slap = require('./Slap');

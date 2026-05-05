var _ = require('lodash');
var blessed = require('blessed');
var path = require('path');

var util = require('../slap-util');
var git = require('../git');

var BaseWidget = require('./BaseWidget');
var Slap = require('./Slap');
var Button = require('./Button');

class Header extends BaseWidget {
  constructor(opts) {
    super(_.merge(opts.headerPosition !== 'bottom'
      ? {top: 0}
      : {bottom: 0}, {
      left: 0,
      right: 0,
      height: 1
    }, Slap.global.options.header, opts));
    var self = this;

    self.leftContent = new BaseWidget(_.merge({
      parent: self,
      tags: true,
      left: 1,
      shrink: true,
      style: self.options.style
    }, self.options.leftContent));

    var helpBinding = Slap.global.options.bindings.help;
    helpBinding = Array.isArray(helpBinding) ? helpBinding[0] : helpBinding;
    self.helpButton = new Button(_.merge({
      parent: self,
      content: "Help" + (helpBinding ? ": " + helpBinding : "")
    }, self.options.helpButton));

    self.rightContent = new BaseWidget(_.merge({
      parent: self,
      tags: true,
      shrink: true,
      style: self.options.style
    }, self.options.rightContent));

    self.messageContent = new BaseWidget(_.merge({
      parent: self,
      tags: true,
      shrink: true,
      style: self.options.style
    }, self.options.messageContent));

    // self._blink(true);
  }

  _initHandlers() {
    var self = this;
    ['message', 'blink'].forEach(function (evt) {
      self.on(evt, function () { self.screen.render(); });
    });
    self.helpButton.on('press', function () { self.screen.slap.help(); });

    // Git status polling. Refreshes on a 5s timer; finer-grained refreshes
    // are triggered from EditorPane on save / debounced edits.
    self._gitStatus = null;
    self.refreshGit = _.debounce(function () { self._refreshGitNow(); }, 250);
    self._gitTimer = setInterval(function () { self._refreshGitNow(); }, 5000);
    if (self._gitTimer.unref) self._gitTimer.unref();
    self.on('detach', function () { clearInterval(self._gitTimer); });
    self._refreshGitNow();

    return super._initHandlers.apply(self, arguments);
  }

  _refreshGitNow() {
    var self = this;
    var cwd = (self.screen && self.screen.slap && self.screen.slap.fileBrowser
      && self.screen.slap.fileBrowser.cwd) || process.cwd();
    git.getStatus(cwd).then(function (status) {
      var prev = self._gitStatus;
      self._gitStatus = status;
      var changed = JSON.stringify(prev) !== JSON.stringify(status);
      if (changed) self.render();
    }).catch(function () { /* swallow; not in a repo */ });
  }

  render() {
    var self = this;

    var left = ["\u270b"];
    var right = [];

    var style = self.options.style;
    var slap = self.screen.slap;
    var pane = slap.getCurrentPane();
    if (pane) {
      var title = pane.getTitle();
      if (title !== null) left.push(title);
      var editor = pane.editor;
      if (editor) {
        var cursor = editor.selection.getHeadPosition();
        var originalEncoding = editor.textBuf.getEncoding();
        right = [
          [cursor.row+1, cursor.column+1].join(","),
          "("+editor.textBuf.getLineCount()+")"
        ];
        if (originalEncoding) right.push(blessed.escape(originalEncoding));
        if (editor.readOnly()) right.push(util.markup("read-only", style.warning));
        if (!editor.insertMode()) right.unshift(util.markup("OVR", style.overwrite));
      }
    }

    var status = self._gitStatus;
    if (status && status.branch) {
      var dirty = status.staged + status.modified + status.conflicted + status.untracked;
      var label = status.branch;
      if (dirty) label += ' \u00b1' + dirty;
      if (status.ahead) label += ' \u2191' + status.ahead;
      if (status.behind) label += ' \u2193' + status.behind;
      var gitStyle = (status.dirty && style.gitDirty) || style.git || '';
      right.push(util.markup(label, gitStyle));
    }

    self.leftContent.setContent(left.join(" "));
    self.rightContent.setContent(right.join(" "));

    var message = self.message() || "";
    if (self._blink()) message = util.markup(message, style.blinkStyle);
    self.messageContent.setContent(message.toString());

    // float: right basically
    ['helpButton', 'rightContent', 'messageContent'].reduce(function (right, key) {
      self[key].right = right;
      return 2 + right + BaseWidget.prototype.shrinkWidth.call(self[key]);
    }, 1);

    return super.render.apply(self, arguments);
  }
}

Header.prototype._blink = util.getterSetter('blink', null, function (blink) {
  var self = this;
  clearTimeout(self.data.blinkTimer);
  if (self.options.blinkRate) {
    self.data.blinkTimer = setTimeout(function () {
      self._blink(!blink);
    }, self.options.blinkRate);
  }
  return blink;
});
Header.prototype.message = util.getterSetter('message', null, function (message, styleName) {
  var self = this;

  clearTimeout(self.data.messageTimer);
  if (message) {
    self.data.messageTimer = setTimeout(function () {
      self.message(null);
    }, self.options.messageDuration);
  }

  // self._blink(false);
  return message !== null ? util.markup(' '+message+' ', self.options.style[styleName || 'info']) : null;
});

module.exports = Header;

var _ = require('lodash');

var Slap = require('./Slap');
var BaseForm = require('./BaseForm');
var BaseWidget = require('base-widget');
var Field = require('editor-widget').Field;

var util = require('../slap-util');

class BaseFindForm extends BaseForm {
  constructor(opts) {
    super(_.merge({
      prevEditorState: {}
    }, Slap.global.options.form.baseFind, opts));
    var self = this;

    self.findField = new Field(_.merge({
      parent: self,
      top: 0,
      left: 0,
      right: 0
    }, Slap.global.options.editor, Slap.global.options.field, self.options.findField));
  }

  find(text, direction) {
    var self = this;
    self.screen.slap.header.message(null);
    if (text) self.emit('find', text, direction);
    else self.resetEditor();
    return self;
  }

  resetEditor() {
    var self = this;
    var prevEditorState = self.options.prevEditorState;
    var editor = self.pane.editor;
    if (prevEditorState.selection) editor.selection.setRange(prevEditorState.selection);
    if (prevEditorState.scroll) { editor.scroll = prevEditorState.scroll; editor._updateContent(); }
  }

  _initHandlers() {
    var self = this;
    var textBuf = self.findField.textBuf;
    var prevEditorState = self.options.prevEditorState;
    self.on('show', function () {
      var editor = self.pane.editor;
      if (!prevEditorState.selection) prevEditorState.selection = editor.selection.getRange();
      if (!prevEditorState.scroll) prevEditorState.scroll = editor.scroll;
      self.findField.focus();
      self.find(textBuf.getText());
    });
    self.on('hide', function () {
      if (!_.some(self.pane.forms, 'visible')) {
        prevEditorState.selection = null;
        prevEditorState.scroll = null;
      }
    });

    textBuf.onDidChange(function () { self.find(textBuf.getText()); });

    return super._initHandlers.apply(self, arguments);
  }
}

module.exports = BaseFindForm;

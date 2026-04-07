var _ = require('lodash');

var BaseWidget = require('base-widget');

var Slap = require('./Slap');
var SaveAsForm = require('./SaveAsForm');
var Button = require('./Button');

class SaveAsCloseForm extends SaveAsForm {
  constructor(opts) {
    super(_.merge({}, Slap.global.options.saveAsCloseForm, opts));
    var self = this;

    self.discardChangesButton = new Button(_.merge({
      parent: self,
      content: "Discard changes",
      top: 0,
      right: 0
    }, Slap.global.options.button.warning, self.options.discardChangesButton));

    self.pathField.right = BaseWidget.prototype.shrinkWidth.call(self.discardChangesButton);
  }

  _initHandlers() {
    var self = this;
    self.on('show', function () { self.screen.slap.header.message("unsaved changes, please save or discard", 'warning'); });
    self.on('save', function () { self.pane.close(); });
    self.on('discardChanges', function () {
      self.pane.editor.textBuf.reload();
      self.pane.close();
    });
    self.discardChangesButton.on('press', function () { self.emit('discardChanges'); });
    return super._initHandlers.apply(self, arguments);
  }
}

module.exports = SaveAsCloseForm;

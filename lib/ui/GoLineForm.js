var _ = require('lodash');

var BaseWidget = require('base-widget');

var Slap = require('./Slap');
var BaseFindForm = require('./BaseFindForm');
var Label = require('./Label');

class GoLineForm extends BaseFindForm {
  constructor(opts) {
    super(_.merge({
      findField: {left: GoLineForm._label.length}
    }, Slap.global.options.form.goLine, opts));
    var self = this;

    self.goLineLabel = new Label(_.merge({
      parent: self,
      tags: true,
      content: GoLineForm._label,
      top: 0,
      left: 0,
      width: GoLineForm._label.length,
    }, self.options.goLineLabel));
  }

  _initHandlers() {
    var self = this;

    self.findField.on('keypress', function (ch, key) {
      var lineNumber = self.findField.textBuf.getText();
      switch (self.resolveBinding(key)) {
        // Use setTimeout as a horrible hack to prevent
        // the keypress from being transferred to the editor,
        // causing an unintentional extra linebreak.
        case 'next':   setTimeout(function(){ self.find(lineNumber, 1) }, 1); return false;
        case 'submit': setTimeout(function(){ self.find(lineNumber, 1) }, 1); return false;
      };
    });

    self.on('cancel', function () { self.resetEditor(); });
    self.on('show', function () { self.findField.textBuf.setText(''); });
    self.on('find', function (lineNumber, direction) {
      lineNumber = Number(lineNumber) - 1;
      if (lineNumber !== lineNumber) return; // isNaN(lineNumber)
      var selection = self.pane.editor.selection;
      selection.setHeadPosition([lineNumber, 0]);
      selection.clearTail();
      if (direction) self.hide();
      return self;
    });
    return super._initHandlers.apply(self, arguments);
  }
}

GoLineForm._label = " line number: ";

module.exports = GoLineForm;

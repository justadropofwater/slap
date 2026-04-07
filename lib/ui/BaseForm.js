var _ = require('lodash');

var util = require('../slap-util');

var BaseWidget = require('base-widget');
var Slap = require('./Slap');

class BaseForm extends BaseWidget {
  constructor(opts) {
    super(_.merge({
      hidden: true,
      height: 1,
      left: 0,
      right: 0,
      bottom: 0
    }, Slap.global.options.form, opts));
    var self = this;
    if (self.parent instanceof Pane) {
      self.pane = self.parent;
      self.pane.forms.push(self);
    }
  }

  cancel() { this.emit('cancel'); }
  submit() { this.emit('submit'); }

  _initHandlers() {
    var self = this;
    self.on('element keypress', function (el, ch, key) {
      switch (self.resolveBinding(key)) {
        case 'cancel': self.cancel(); return false;
      };
    });
    self.on('show', function () { self.focus(); });
    self.on('hide', function () {
      self.screen.slap._stopKeyPropagation().catch(function(){});
      if (self.screen.focused.hasAncestor(self.pane) && !self.screen.slap.focused.visible) self.pane.focus();
    });
    self.on('element blur', function (el) { if (self.visible && !self.hasFocus(true)) self.cancel(); });
    self.on('element submit', function (el) { if (el !== self) self.submit(); });
    self.on('element cancel', function (el) { if (el !== self) self.cancel(); });
    self.on('cancel', function () { self.hide(); });

    return super._initHandlers.apply(self, arguments);
  }
}

module.exports = BaseForm;

var Pane = require('./Pane'); // circular import

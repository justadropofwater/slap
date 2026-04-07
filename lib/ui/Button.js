var blessed = require('blessed');
var _ = require('lodash');

var util = require('../slap-util');

var BaseWidget = require('base-widget');
var Slap = require('./Slap');

class Button extends BaseWidget.blessed.Button {
  constructor(opts) {
    opts = _.merge({
      mouse: true,
      focusable: true,
      shrink: true,
      padding: {left: 1, right: 1}
    }, Slap.global.options.button, opts);
    opts.style.focus = opts.style.hover;
    super(opts);
    BaseWidget.call(this, opts);
  }

  _initHandlers() {
    var self = this;
    self.on('keypress', function (ch, key) {
      if (key.name === 'enter') self.screen.slap._stopKeyPropagation().catch(function(){}); // FIXME: hack
    });
    return BaseWidget.prototype._initHandlers.apply(self, arguments);
  }
}

module.exports = Button;

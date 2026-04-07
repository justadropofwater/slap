var blessed = require('blessed');
var _ = require('lodash');

var util = require('../slap-util');

var BaseWidget = require('base-widget');
var Slap = require('./Slap');

class Label extends BaseWidget.blessed.Text {
  constructor(opts) {
    opts = _.merge({
      height: 1
    }, Slap.global.options.label, opts);

    super(opts);
    BaseWidget.call(this, opts);
  }
}

module.exports = Label;

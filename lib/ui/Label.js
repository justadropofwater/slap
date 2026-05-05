var blessed = require('blessed');
var _ = require('lodash');

var util = require('../slap-util');

var BaseWidget = require('./BaseWidget');
var Slap = require('./Slap');

class Label extends BaseWidget.blessed.Text {
  constructor(opts) {
    opts = _.merge({
      height: 1
    }, Slap.global.options.label, opts);

    super(opts);
    BaseWidget._initBaseWidget(this, opts);
  }
}

module.exports = Label;

var blessed = require('blessed');
var _ = require('lodash');

var util = require('../slap-util');

var BaseWidget = require('base-widget');
var Slap = require('./Slap');

class FileBrowser extends BaseWidget.blessed.FileManager {
  constructor(opts) {
    opts = _.merge({
      keys: true,
      mouse: true,
      focusable: true
    }, Slap.global.options.fileBrowser, opts);
    super(opts);
    BaseWidget.call(this, opts);
    var self = this;

    self.refresh();
    self.data.selectedStyle = self.style.selected;
    self.data.itemStyle = self.style.item;
  }

  _initHandlers() {
    var self = this;
    var slap = self.screen.slap;
    self.on('element mousedown', function (el) { self.focus(); });
    self.on('file', function (path) { slap.open(path, true).catch(function(){}); });
    self.on('cancel', function () {
      var currentPane = slap.getCurrentPane();
      if (currentPane) currentPane.focus();
    });

    self.on('focus', function () {
      self.style.selected = self.data.selectedStyle;
      self.screen.program.hideCursor();
    });
    self.on('blur', function () {
      self.style.selected = self.data.itemStyle;
    });

    return BaseWidget.prototype._initHandlers.apply(self, arguments);
  }
}

module.exports = FileBrowser;

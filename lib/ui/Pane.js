var _ = require('lodash');

var util = require('../slap-util');

var BaseWidget = require('base-widget');

class Pane extends BaseWidget {
  constructor(opts) {
    super(_.merge({
      top:    Slap.global.header.options.headerPosition === 'top'    ? 1 : 0,
      bottom: Slap.global.header.options.headerPosition === 'bottom' ? 1 : 0,
      left: 0,
      right: 0,
    }, Slap.global.options.pane, opts));
    var self = this;
    self.left = Slap.global.fileBrowser.visible ? Slap.global.fileBrowser.width : 0;

    if (!self.parent.panes) self.parent.panes = [];
    self.parent.panes.push(self);
  }

  getTitle() {
    return "Untitled pane";
  }

  setCurrent() {
    var self = this;
    var slap = self.screen.slap;
    var panes = slap.panes;
    var paneIndex = panes.indexOf(self);
    if (paneIndex === -1) { paneIndex = panes.length; panes.push(self); }
    slap.data.prevPane = slap.data.currentPane;
    slap.data.currentPane = paneIndex;
    self.focus();
    return self;
  }

  close() {
    var self = this;

    var slap = self.screen.slap;
    var paneIndex = slap.panes.indexOf(self);
    if (paneIndex !== -1) slap.panes.splice(paneIndex, 1);

    self.emit('close', paneIndex);
    self.detach();

    return true;
  }

  _initHandlers() {
    var self = this;

    self.on('close', function () { self.screen.slap.header.message(null); });

    return super._initHandlers.apply(self, arguments);
  }
}

module.exports = Pane;

var Slap = require('./Slap');

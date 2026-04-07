#!/usr/bin/env node
/*global require*/

var test = require('tape');
var util = require('base-widget/spec/util');

var cli = require('../lib/cli');
var Slap = require('../lib/ui/Slap');

test("cli", function (t) {
  t.plan(1);

  cli({screen: util.screenFactory()}).then(function (slap) {
    t.ok(slap instanceof Slap, 'should create an instance of slap');

    if (slap && typeof slap.quit === 'function') {
      slap.quit();
    }
  }).catch(function (err) {
    t.fail('cli threw: ' + (err.stack || err));
  });
});

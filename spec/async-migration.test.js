var test = require('tape');
var path = require('path');
var fs = require('fs');
var os = require('os');

var Slap = require('../lib/ui/Slap');

test('async-migration: Slap.getUserDir creates directory and returns path', function (t) {
  t.plan(2);

  Slap.getUserDir().then(function (userDir) {
    t.ok(typeof userDir === 'string', 'returns a string path');
    t.ok(fs.existsSync(userDir), 'directory exists');
  }).catch(function (err) {
    t.fail(err.message);
  });
});

test('async-migration: _stopKeyPropagation returns a promise', function (t) {
  t.plan(2);

  var mockSlap = { lockKeys: false };
  var fn = Slap.prototype._stopKeyPropagation.bind(mockSlap);
  var result = fn();

  t.ok(result instanceof Promise, 'returns a Promise');
  t.equal(mockSlap.lockKeys, true, 'lockKeys set to true immediately');

  result.then(function () {
    t.end();
  });
});

test('async-migration: plugin-loader returns resolved promise', function (t) {
  var loadPlugins = require('../lib/plugin-loader');
  var result = loadPlugins({ val: {}, paths: [] });
  t.ok(result instanceof Promise, 'loadPlugins returns a Promise');
  result.then(function (plugins) {
    t.ok(Array.isArray(plugins), 'resolves to an array');
    t.equal(plugins.length, 0, 'empty paths yields empty array');
    t.end();
  });
});

test('async-migration: FindForm regex test still passes', function (t) {
  var FindForm = require('../lib/ui/FindForm');
  var re = FindForm._regExpRegExp;

  t.notOk(re.test('hello'), 'plain string is not a regex');
  t.notOk(re.test('//'), 'empty regex is not matched');
  t.ok(re.test('/pattern/'), '/pattern/ matches');
  t.ok(re.test('/pattern/i'), '/pattern/i matches');
  t.ok(re.test('/pattern/g'), '/pattern/g matches');
  t.ok(re.test('/pattern/m'), '/pattern/m matches');
  t.ok(re.test('/pattern/gmi'), '/pattern/gmi matches');
  t.end();
});

test('async-migration: getUserDir is idempotent', function (t) {
  t.plan(1);

  Slap.getUserDir().then(function (dir1) {
    return Slap.getUserDir().then(function (dir2) {
      t.equal(dir1, dir2, 'returns same directory on repeated calls');
    });
  }).catch(function (err) {
    t.fail(err.message);
  });
});

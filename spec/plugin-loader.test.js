var test = require('tape');
var path = require('path');
var fs = require('fs');
var os = require('os');
var loadPlugins = require('../lib/plugin-loader');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'slap-plugin-test-'));
}

function createPlugin(dir, name, keywords, code) {
  var pluginDir = path.join(dir, name);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'package.json'), JSON.stringify({
    name: name,
    version: '1.0.0',
    keywords: keywords || [],
    main: 'index.js'
  }));
  fs.writeFileSync(path.join(pluginDir, 'index.js'), code || 'module.exports = function(val) {};');
}

test('plugin-loader: loads valid plugin with matching keyword', function (t) {
  var dir = createTempDir();
  createPlugin(dir, 'test-plugin', ['slap-plugin'], 'module.exports = function(val) { val.loaded = true; };');

  var ctx = {};
  loadPlugins({ val: ctx, keyword: 'slap-plugin', paths: [dir] }).then(function (results) {
    t.equal(results.length, 1, 'found 1 plugin');
    t.equal(results[0].plugin, 'test-plugin', 'plugin name correct');
    return results[0].promise;
  }).then(function () {
    t.equal(ctx.loaded, true, 'plugin was called with val');
    t.end();
  }).catch(function (err) {
    t.fail(err.message);
    t.end();
  });
});

test('plugin-loader: skips plugin without matching keyword', function (t) {
  var dir = createTempDir();
  createPlugin(dir, 'other-plugin', ['not-slap'], 'module.exports = function(val) { val.loaded = true; };');

  var ctx = {};
  loadPlugins({ val: ctx, keyword: 'slap-plugin', paths: [dir] }).then(function (results) {
    t.equal(results.length, 0, 'no plugins loaded');
    t.equal(ctx.loaded, undefined, 'plugin was not called');
    t.end();
  });
});

test('plugin-loader: handles empty plugin directory', function (t) {
  var dir = createTempDir();

  loadPlugins({ val: {}, keyword: 'slap-plugin', paths: [dir] }).then(function (results) {
    t.equal(results.length, 0, 'no plugins found');
    t.end();
  });
});

test('plugin-loader: handles non-existent plugin directory', function (t) {
  loadPlugins({ val: {}, keyword: 'slap-plugin', paths: ['/nonexistent/path'] }).then(function (results) {
    t.equal(results.length, 0, 'no plugins found');
    t.end();
  });
});

test('plugin-loader: handles plugin that throws on init', function (t) {
  var dir = createTempDir();
  createPlugin(dir, 'bad-plugin', ['slap-plugin'], 'module.exports = function() { throw new Error("plugin error"); };');

  loadPlugins({ val: {}, keyword: 'slap-plugin', paths: [dir] }).then(function (results) {
    t.equal(results.length, 1, 'plugin was found');
    return results[0].promise.then(function () {
      t.fail('should have rejected');
    }).catch(function (err) {
      t.ok(err.message.includes('plugin error'), 'error is propagated');
    });
  }).then(function () {
    t.end();
  });
});

test('plugin-loader: handles malformed package.json', function (t) {
  var dir = createTempDir();
  var pluginDir = path.join(dir, 'broken-plugin');
  fs.mkdirSync(pluginDir);
  fs.writeFileSync(path.join(pluginDir, 'package.json'), '{invalid json');
  fs.writeFileSync(path.join(pluginDir, 'index.js'), 'module.exports = function() {};');

  loadPlugins({ val: {}, keyword: 'slap-plugin', paths: [dir] }).then(function (results) {
    t.equal(results.length, 0, 'malformed plugin skipped');
    t.end();
  });
});

test('plugin-loader: loads standalone JS files as plugins', function (t) {
  var dir = createTempDir();
  fs.writeFileSync(path.join(dir, 'simple.js'), 'module.exports = function(val) { val.simple = true; };');

  var ctx = {};
  loadPlugins({ val: ctx, paths: [dir] }).then(function (results) {
    t.equal(results.length, 1, 'found 1 plugin');
    return results[0].promise;
  }).then(function () {
    t.equal(ctx.simple, true, 'standalone JS plugin was loaded');
    t.end();
  });
});

test('plugin-loader: loads plugins from multiple paths', function (t) {
  var dir1 = createTempDir();
  var dir2 = createTempDir();
  createPlugin(dir1, 'plugin-a', ['slap-plugin']);
  createPlugin(dir2, 'plugin-b', ['slap-plugin']);

  loadPlugins({ val: {}, keyword: 'slap-plugin', paths: [dir1, dir2] }).then(function (results) {
    t.equal(results.length, 2, 'found plugins from both paths');
    t.end();
  });
});

test('plugin-loader: handles async plugin', function (t) {
  var dir = createTempDir();
  createPlugin(dir, 'async-plugin', ['slap-plugin'],
    'module.exports = function(val) { return new Promise(function(r) { val.async = true; setTimeout(r, 10); }); };'
  );

  var ctx = {};
  loadPlugins({ val: ctx, keyword: 'slap-plugin', paths: [dir] }).then(function (results) {
    return results[0].promise;
  }).then(function () {
    t.equal(ctx.async, true, 'async plugin resolved');
    t.end();
  });
});

var test = require('tape');
var path = require('path');
var fs = require('fs');
var os = require('os');
var pathwatcher = require('pathwatcher');

function tmpFile(name) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
  return path.join(dir, name || 'test.txt');
}

test('pathwatcher: module loads and exports expected API', function (t) {
  t.equal(typeof pathwatcher.watch, 'function', 'watch is a function');
  t.equal(typeof pathwatcher.closeAllWatchers, 'function', 'closeAllWatchers is a function');
  t.equal(typeof pathwatcher.getWatchedPaths, 'function', 'getWatchedPaths is a function');
  t.ok(pathwatcher.File, 'File class exists');
  t.ok(pathwatcher.Directory, 'Directory class exists');
  t.end();
});

test('pathwatcher: watch detects file changes', function (t) {
  t.plan(2);
  t.timeoutAfter(5000);

  var filePath = tmpFile('watch-test.txt');
  fs.writeFileSync(filePath, 'initial');

  var watcher = pathwatcher.watch(filePath, function (event) {
    t.ok(event === 'change' || event === 'rename', 'received change or rename event');
    watcher.close();
    t.pass('watcher closed without error');
    fs.unlinkSync(filePath);
  });

  setTimeout(function () {
    fs.writeFileSync(filePath, 'modified');
  }, 200);
});

test('pathwatcher: File reads content', function (t) {
  var filePath = tmpFile('file-test.txt');
  fs.writeFileSync(filePath, 'file content');

  var file = new pathwatcher.File(filePath);
  file.read().then(function (content) {
    t.equal(content, 'file content', 'File reads correct content');
    fs.unlinkSync(filePath);
    t.end();
  }).catch(function (err) {
    t.fail('read failed: ' + err.message);
    t.end();
  });
});

test('pathwatcher: closeAllWatchers works', function (t) {
  var filePath = tmpFile('close-all.txt');
  fs.writeFileSync(filePath, 'test');

  pathwatcher.watch(filePath, function () {});
  t.ok(pathwatcher.getWatchedPaths().length > 0, 'has watched paths');

  pathwatcher.closeAllWatchers();
  t.equal(pathwatcher.getWatchedPaths().length, 0, 'all watchers closed');

  fs.unlinkSync(filePath);
  t.end();
});

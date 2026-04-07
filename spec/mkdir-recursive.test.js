var test = require('tape');
var path = require('path');
var fs = require('fs');
var os = require('os');

function tmpPath() {
  return path.join(os.tmpdir(), 'slap-mkdir-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
}

test('mkdir-recursive: creates deeply nested directory', function (t) {
  var dir = path.join(tmpPath(), 'a', 'b', 'c', 'd');

  fs.promises.mkdir(dir, { recursive: true }).then(function () {
    t.ok(fs.existsSync(dir), 'nested directory was created');
    t.ok(fs.statSync(dir).isDirectory(), 'is a directory');
    t.end();
  }).catch(function (err) {
    t.fail(err.message);
    t.end();
  });
});

test('mkdir-recursive: does not throw on existing directory', function (t) {
  var dir = tmpPath();
  fs.mkdirSync(dir, { recursive: true });

  fs.promises.mkdir(dir, { recursive: true }).then(function () {
    t.pass('no error on existing directory');
    t.ok(fs.existsSync(dir), 'directory still exists');
    t.end();
  }).catch(function (err) {
    t.fail('should not throw: ' + err.message);
    t.end();
  });
});

test('mkdir-recursive: created directory has correct permissions', function (t) {
  var dir = path.join(tmpPath(), 'perm-test');

  fs.promises.mkdir(dir, { recursive: true }).then(function () {
    var stat = fs.statSync(dir);
    var mode = stat.mode & 0o777;
    t.ok(mode >= 0o700, 'directory is at least owner-rwx (mode: 0' + mode.toString(8) + ')');
    t.end();
  }).catch(function (err) {
    t.fail(err.message);
    t.end();
  });
});

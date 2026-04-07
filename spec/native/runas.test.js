var test = require('tape');
var runas = require('runas');

test('runas: module loads and exports a function', function (t) {
  t.equal(typeof runas, 'function', 'runas is a function');
  t.end();
});

test('runas: executes a simple command and returns exit code', function (t) {
  var code = runas('/bin/echo', ['hello'], {});
  t.equal(code, 0, 'echo exits with code 0');
  t.end();
});

test('runas: returns non-zero exit code for failing command', function (t) {
  var code = runas('/bin/sh', ['-c', 'exit 42'], {});
  t.equal(code, 42, 'exit 42 returns code 42');
  t.end();
});

test('runas: catchOutput captures stdout', function (t) {
  var result = runas('/bin/echo', ['hello world'], { catchOutput: true });
  t.equal(typeof result, 'object', 'result is an object when catchOutput is true');
  t.equal(result.exitCode, 0, 'exit code is 0');
  t.equal(result.stdout.trim(), 'hello world', 'stdout contains expected output');
  t.equal(typeof result.stderr, 'string', 'stderr is a string');
  t.end();
});

test('runas: catchOutput captures stderr', function (t) {
  var result = runas('/bin/sh', ['-c', 'echo err >&2'], { catchOutput: true });
  t.equal(result.exitCode, 0, 'exit code is 0');
  t.equal(result.stderr.trim(), 'err', 'stderr contains expected output');
  t.end();
});

test('runas: handles multiple arguments', function (t) {
  var result = runas('/bin/echo', ['a', 'b', 'c'], { catchOutput: true });
  t.equal(result.exitCode, 0, 'echo with multiple args exits 0');
  t.equal(result.stdout.trim(), 'a b c', 'all arguments passed correctly');
  t.end();
});

var test = require('tape');
var path = require('path');

var util = require('../lib/slap-util');

test('slap-util: parseOpts coerces booleans and numbers in strings', function (t) {
  var input = {
    a: 'true',
    b: 'false',
    c: '42',
    d: '3.14',
    e: 'hello',
    nested: { f: 'true', g: 'NaN', h: 'not-a-number' },
    list: ['1', 'true', 'x']
  };
  var out = util.parseOpts(input);

  t.equal(out.a, true, '"true" -> true');
  t.equal(out.b, false, '"false" -> false');
  t.equal(out.c, 42, '"42" -> 42');
  t.equal(out.d, 3.14, '"3.14" -> 3.14');
  t.equal(out.e, 'hello', 'plain string preserved');
  t.equal(out.nested.f, true, 'nested boolean coerced');
  t.equal(out.nested.g, 'NaN', '"NaN" string preserved (Number(NaN) is NaN)');
  t.equal(out.nested.h, 'not-a-number', 'non-numeric string preserved');
  t.deepEqual(out.list, [1, true, 'x'], 'array elements coerced');
  t.notEqual(out, input, 'returns new object (not mutated)');
  t.end();
});

test('slap-util: parseOpts handles null and undefined gracefully', function (t) {
  t.equal(util.parseOpts(null), null);
  t.equal(util.parseOpts(undefined), undefined);
  t.equal(util.parseOpts(0), 0);
  t.deepEqual(util.parseOpts({ a: null, b: undefined }), { a: null, b: undefined });
  t.end();
});

test('slap-util: resolvePath expands ~ to home dir', function (t) {
  var home = process.platform !== 'win32' ? process.env.HOME : process.env.USERPROFILE;
  t.equal(util.resolvePath('~'), home, '~ expands to home');
  t.equal(util.resolvePath('~/foo'), path.join(home, 'foo'), '~/foo expands');
  t.end();
});

test('slap-util: resolvePath leaves non-tilde paths absolute', function (t) {
  var abs = util.resolvePath('foo/bar');
  t.equal(abs, path.resolve(process.cwd(), 'foo/bar'), 'relative paths resolved against cwd');
  t.equal(util.resolvePath('/etc/passwd'), '/etc/passwd', 'absolute paths preserved');
  t.equal(util.resolvePath(''), process.cwd(), 'empty path falls back to cwd');
  t.end();
});

test('slap-util: mod returns positive remainder for negative dividends', function (t) {
  t.equal(util.mod(5, 3), 2, 'positive');
  t.equal(util.mod(-1, 3), 2, 'negative wraps');
  t.equal(util.mod(-4, 3), 2, 'further negative wraps');
  t.equal(util.mod(0, 3), 0, 'zero');
  t.end();
});

test('slap-util: typeOf returns constructor name', function (t) {
  function Foo() {}
  var foo = new Foo();
  t.equal(util.typeOf(foo), 'Foo', 'returns constructor name');

  class Bar {}
  var bar = new Bar();
  t.equal(util.typeOf(bar), 'Bar', 'works for ES6 class');
  t.end();
});

test('slap-util: markup parses {tag}text{/tag}', function (t) {
  var m = util.markup.parse('hello {bold}world{/bold}!');
  t.equal(typeof m.toString, 'function', 'returns Markup-like object');
  var s = m.toString();
  t.ok(s.indexOf('{bold}') !== -1, 'bold tag preserved in toString');
  t.ok(s.indexOf('{/bold}') !== -1, 'closing bold tag present');
  t.ok(s.indexOf('world') !== -1, 'inner text present');
  t.end();
});

test('slap-util: markup tagging wraps text in style', function (t) {
  var s = util.markup('plain', '{red-fg}').toString();
  t.equal(s.indexOf('{red-fg}'), 0, 'style tag at start');
  t.ok(s.indexOf('{/red-fg}') > 0, 'closing tag present');
  t.ok(s.indexOf('plain') !== -1, 'text preserved');
  t.end();
});

test('slap-util: logger is callable and writes to stream when configured', function (t) {
  t.plan(2);
  var chunks = [];
  var stream = {
    write: function (msg) { chunks.push(msg); }
  };

  util.logger({ stream: stream, level: 'info' });
  util.logger.info('hello', 'world');
  util.logger.debug('should not appear');

  setImmediate(function () {
    t.equal(chunks.length, 1, 'only info-level message written');
    t.ok(chunks[0].indexOf('hello world') !== -1, 'log content includes args');
    util.logger({});
  });
});

test('slap-util: getterSetter creates dual-purpose accessor', function (t) {
  var obj = {
    data: {},
    emit: function () {}
  };
  var accessor = util.getterSetter('foo');
  accessor.call(obj, 'bar');
  t.equal(obj.data.foo, 'bar', 'set stored value');
  t.equal(accessor.call(obj), 'bar', 'get returned stored value');
  t.end();
});

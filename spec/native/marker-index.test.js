var test = require('tape');
var MarkerIndex = require('marker-index');

function point(row, column) {
  return { row: row, column: column };
}

test('marker-index: module loads and is a constructor', function (t) {
  t.equal(typeof MarkerIndex, 'function', 'MarkerIndex is a function');
  var idx = new MarkerIndex(1);
  t.ok(idx, 'can create instance');
  t.end();
});

test('marker-index: insert and getStart/getEnd', function (t) {
  var idx = new MarkerIndex(42);
  idx.insert(1, point(0, 0), point(0, 5));

  var start = idx.getStart(1);
  var end = idx.getEnd(1);
  t.deepEqual(start, point(0, 0), 'getStart returns correct point');
  t.deepEqual(end, point(0, 5), 'getEnd returns correct point');
  t.end();
});

test('marker-index: delete removes marker', function (t) {
  var idx = new MarkerIndex(42);
  idx.insert(1, point(0, 0), point(0, 5));
  idx.delete(1);

  var dump = idx.dump();
  t.deepEqual(dump, {}, 'dump is empty after delete');
  t.end();
});

test('marker-index: splice updates marker positions', function (t) {
  var idx = new MarkerIndex(42);
  idx.insert(1, point(0, 5), point(0, 10));

  var result = idx.splice(point(0, 0), point(0, 0), point(0, 3));
  t.ok(result, 'splice returns a result');

  var start = idx.getStart(1);
  t.equal(start.row, 0, 'row unchanged');
  t.equal(start.column, 8, 'column shifted by inserted text length');
  t.end();
});

test('marker-index: findIntersecting returns matching markers', function (t) {
  var idx = new MarkerIndex(42);
  idx.insert(1, point(0, 0), point(0, 10));
  idx.insert(2, point(0, 5), point(0, 15));
  idx.insert(3, point(1, 0), point(1, 5));

  var result = idx.findIntersecting(point(0, 3), point(0, 7));
  t.ok(result instanceof Set, 'result is a Set');
  t.ok(result.has(1), 'marker 1 intersects');
  t.ok(result.has(2), 'marker 2 intersects');
  t.notOk(result.has(3), 'marker 3 does not intersect');
  t.end();
});

test('marker-index: findContaining returns markers that fully contain range', function (t) {
  var idx = new MarkerIndex(42);
  idx.insert(1, point(0, 0), point(0, 20));
  idx.insert(2, point(0, 5), point(0, 8));

  var result = idx.findContaining(point(0, 5), point(0, 10));
  t.ok(result.has(1), 'marker 1 contains the range');
  t.notOk(result.has(2), 'marker 2 does not contain the range');
  t.end();
});

test('marker-index: dump returns all markers', function (t) {
  var idx = new MarkerIndex(42);
  idx.insert(1, point(0, 0), point(0, 5));
  idx.insert(2, point(1, 0), point(1, 10));

  var dump = idx.dump();
  t.ok(dump[1], 'marker 1 in dump');
  t.ok(dump[2], 'marker 2 in dump');
  t.deepEqual(dump[1].start, point(0, 0), 'marker 1 start correct');
  t.deepEqual(dump[2].end, point(1, 10), 'marker 2 end correct');
  t.end();
});

test('marker-index: compare returns ordering between markers', function (t) {
  var idx = new MarkerIndex(42);
  idx.insert(1, point(0, 0), point(0, 5));
  idx.insert(2, point(0, 10), point(0, 15));

  var cmp = idx.compare(1, 2);
  t.equal(typeof cmp, 'number', 'compare returns a number');
  t.ok(cmp < 0, 'marker 1 comes before marker 2');
  t.end();
});

test('marker-index: generateRandomNumber returns a number', function (t) {
  var idx = new MarkerIndex(42);
  var num = idx.generateRandomNumber();
  t.equal(typeof num, 'number', 'returns a number');
  t.ok(num > 0, 'returns positive number');
  t.end();
});

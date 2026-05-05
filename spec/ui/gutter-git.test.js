var test = require('tape');
var path = require('path');
var rc = require('rc');
var _ = require('lodash');

var util = require('../../lib/slap-util');
var screenFactory = require('../util').screenFactory;
var Slap = require('../../lib/ui/Slap');
var EditorPane = require('../../lib/ui/EditorPane');

function buildSlap() {
  var pkg = require('../../package');
  var configFile = path.join(__dirname, '..', '..', pkg.name + '.ini');
  var opts = util.parseOpts(rc(pkg.name, configFile));
  opts = _.merge(opts, opts.slap);
  opts.screen = screenFactory();
  return new Slap(opts);
}

function flushUpdate(editor) {
  // editor._updateContent is lodash-throttled; flush forces synchronous render.
  if (typeof editor._updateContent.flush === 'function') editor._updateContent.flush();
  editor._updateContent();
  if (typeof editor._updateContent.flush === 'function') editor._updateContent.flush();
}

test('gutter-git: editor renders without diff data (gitDiff null)', function (t) {
  t.plan(3);
  var slap = buildSlap();
  var pane = new EditorPane({ parent: slap });
  pane.editor.textBuf.setText('a\nb\nc\n');
  pane.editor.gitDiff = null;
  t.doesNotThrow(function () { flushUpdate(pane.editor); }, 'no throw');
  setTimeout(function () {
    var gutterContent = pane.editor.gutter.content || '';
    t.ok(gutterContent.indexOf('1') !== -1, 'line 1 number rendered');
    t.ok(gutterContent.indexOf('2') !== -1, 'line 2 number rendered');
    slap.quit();
  }, 50);
});

test('gutter-git: added rows get the added marker glyph', function (t) {
  t.plan(1);
  var slap = buildSlap();
  var pane = new EditorPane({ parent: slap });
  pane.editor.textBuf.setText('a\nb\nc\n');
  pane.editor.gitDiff = {
    added: new Set([0, 1]),
    modified: new Set(),
    deletedAtRow: new Set()
  };
  flushUpdate(pane.editor);
  setTimeout(function () {
    var gutterContent = pane.editor.gutter.content || '';
    t.ok(gutterContent.indexOf('\u2503') !== -1, 'added marker glyph U+2503 in gutter');
    slap.quit();
  }, 50);
});

test('gutter-git: deletedAtRow gets the deletion marker glyph', function (t) {
  t.plan(1);
  var slap = buildSlap();
  var pane = new EditorPane({ parent: slap });
  pane.editor.textBuf.setText('a\nb\nc\n');
  pane.editor.gitDiff = {
    added: new Set(),
    modified: new Set(),
    deletedAtRow: new Set([1])
  };
  flushUpdate(pane.editor);
  setTimeout(function () {
    var gutterContent = pane.editor.gutter.content || '';
    t.ok(gutterContent.indexOf('\u2581') !== -1, 'deletion marker glyph U+2581 in gutter');
    slap.quit();
  }, 50);
});

test('gutter-git: gutter width budget unchanged when diff data toggles', function (t) {
  t.plan(1);
  var slap = buildSlap();
  var pane = new EditorPane({ parent: slap });
  pane.editor.textBuf.setText('a\nb\nc\n');

  pane.editor.gitDiff = null;
  flushUpdate(pane.editor);
  var widthWithoutDiff = pane.editor.gutter.width;

  pane.editor.gitDiff = {
    added: new Set([0]),
    modified: new Set([1]),
    deletedAtRow: new Set([2])
  };
  flushUpdate(pane.editor);
  setTimeout(function () {
    var widthWithDiff = pane.editor.gutter.width;
    t.equal(widthWithDiff, widthWithoutDiff, 'gutter widget width unchanged');
    slap.quit();
  }, 50);
});

test('gutter-git: EditorPane._refreshGitDiff is callable when not in a repo', function (t) {
  t.plan(1);
  var slap = buildSlap();
  var pane = new EditorPane({ parent: slap });
  pane.editor.textBuf.setText('a\n');
  // Without a path, _refreshGitDiff clears any prior diff data without throwing.
  pane.editor.gitDiff = { added: new Set([0]), modified: new Set(), deletedAtRow: new Set() };
  pane._refreshGitDiff();
  t.equal(pane.editor.gitDiff, null, 'gitDiff cleared when no file path');
  slap.quit();
});

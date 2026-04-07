var test = require('tape');

var BaseWidget = require('base-widget');
var Slap = require('../../lib/ui/Slap');
var Pane = require('../../lib/ui/Pane');
var EditorPane = require('../../lib/ui/EditorPane');
var BaseForm = require('../../lib/ui/BaseForm');
var BaseFindForm = require('../../lib/ui/BaseFindForm');
var FindForm = require('../../lib/ui/FindForm');
var GoLineForm = require('../../lib/ui/GoLineForm');
var SaveAsForm = require('../../lib/ui/SaveAsForm');
var SaveAsCloseForm = require('../../lib/ui/SaveAsCloseForm');
var Header = require('../../lib/ui/Header');
var PaneList = require('../../lib/ui/PaneList');
var Label = require('../../lib/ui/Label');
var Button = require('../../lib/ui/Button');
var FileBrowser = require('../../lib/ui/FileBrowser');

test('class-migration: all UI classes are functions', function (t) {
  var classes = {
    Slap: Slap, Pane: Pane, EditorPane: EditorPane,
    BaseForm: BaseForm, BaseFindForm: BaseFindForm,
    FindForm: FindForm, GoLineForm: GoLineForm,
    SaveAsForm: SaveAsForm, SaveAsCloseForm: SaveAsCloseForm,
    Header: Header, PaneList: PaneList, Label: Label,
    Button: Button, FileBrowser: FileBrowser
  };

  Object.keys(classes).forEach(function (name) {
    t.equal(typeof classes[name], 'function', name + ' is a function/class');
  });
  t.end();
});

test('class-migration: Slap extends BaseWidget', function (t) {
  t.ok(Slap.prototype instanceof BaseWidget || Object.getPrototypeOf(Slap.prototype) === BaseWidget.prototype,
    'Slap extends BaseWidget');
  t.end();
});

test('class-migration: Pane extends BaseWidget', function (t) {
  t.ok(Pane.prototype instanceof BaseWidget || Object.getPrototypeOf(Pane.prototype) === BaseWidget.prototype,
    'Pane extends BaseWidget');
  t.end();
});

test('class-migration: EditorPane extends Pane', function (t) {
  t.ok(EditorPane.prototype instanceof Pane || Object.getPrototypeOf(EditorPane.prototype) === Pane.prototype,
    'EditorPane extends Pane');
  t.end();
});

test('class-migration: FindForm extends BaseFindForm', function (t) {
  t.ok(FindForm.prototype instanceof BaseFindForm || Object.getPrototypeOf(FindForm.prototype) === BaseFindForm.prototype,
    'FindForm extends BaseFindForm');
  t.end();
});

test('class-migration: BaseFindForm extends BaseForm', function (t) {
  t.ok(BaseFindForm.prototype instanceof BaseForm || Object.getPrototypeOf(BaseFindForm.prototype) === BaseForm.prototype,
    'BaseFindForm extends BaseForm');
  t.end();
});

test('class-migration: SaveAsCloseForm extends SaveAsForm', function (t) {
  t.ok(SaveAsCloseForm.prototype instanceof SaveAsForm || Object.getPrototypeOf(SaveAsCloseForm.prototype) === SaveAsForm.prototype,
    'SaveAsCloseForm extends SaveAsForm');
  t.end();
});

test('class-migration: PaneList extends Pane', function (t) {
  t.ok(PaneList.prototype instanceof Pane || Object.getPrototypeOf(PaneList.prototype) === Pane.prototype,
    'PaneList extends Pane');
  t.end();
});

test('class-migration: Slap.getUserDir is a static method', function (t) {
  t.equal(typeof Slap.getUserDir, 'function', 'getUserDir is a function on Slap');
  t.ok(!Slap.prototype.getUserDir || Slap.getUserDir !== Slap.prototype.getUserDir,
    'getUserDir is not an instance method');
  t.end();
});

test('class-migration: Slap.global starts as null', function (t) {
  t.equal(Slap.global, null, 'Slap.global is initially null');
  t.end();
});

test('class-migration: FindForm has static _regExpRegExp', function (t) {
  t.ok(FindForm._regExpRegExp instanceof RegExp, 'FindForm._regExpRegExp is a RegExp');
  t.end();
});

test('class-migration: key methods exist on prototypes', function (t) {
  t.equal(typeof Slap.prototype.open, 'function', 'Slap.prototype.open exists');
  t.equal(typeof Slap.prototype.quit, 'function', 'Slap.prototype.quit exists');
  t.equal(typeof Slap.prototype.help, 'function', 'Slap.prototype.help exists');
  t.equal(typeof Slap.prototype._initPlugins, 'function', 'Slap.prototype._initPlugins exists');
  t.equal(typeof Slap.prototype._stopKeyPropagation, 'function', 'Slap.prototype._stopKeyPropagation exists');
  t.equal(typeof EditorPane.prototype.save, 'function', 'EditorPane.prototype.save exists');
  t.equal(typeof EditorPane.prototype.close, 'function', 'EditorPane.prototype.close exists');
  t.equal(typeof EditorPane.prototype.getTitle, 'function', 'EditorPane.prototype.getTitle exists');
  t.equal(typeof Pane.prototype.setCurrent, 'function', 'Pane.prototype.setCurrent exists');
  t.equal(typeof Pane.prototype.close, 'function', 'Pane.prototype.close exists');
  t.end();
});

test('class-migration: circular imports resolve correctly', function (t) {
  var header = require('../../lib/ui/Header');
  var fb = require('../../lib/ui/FileBrowser');
  var pane = require('../../lib/ui/Pane');
  var ep = require('../../lib/ui/EditorPane');
  var pl = require('../../lib/ui/PaneList');

  t.equal(typeof header, 'function', 'Header resolves');
  t.equal(typeof fb, 'function', 'FileBrowser resolves');
  t.equal(typeof pane, 'function', 'Pane resolves');
  t.equal(typeof ep, 'function', 'EditorPane resolves');
  t.equal(typeof pl, 'function', 'PaneList resolves');
  t.end();
});

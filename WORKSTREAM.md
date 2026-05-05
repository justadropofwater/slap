# Slap Modernization Workstream

This document captures the state, decisions, and accumulated tribal knowledge
of the slap modernization effort. It is a living context dump for future
agents (and humans) so nobody has to re-derive what was already worked out.

For the rules-of-thumb that should bias every agent action, see
[`.cursor/rules/`](.cursor/rules/). This file is the *narrative* — the rules
are the *imperatives*. For the user-facing release log, see
[CHANGELOG.md](CHANGELOG.md).

---

## Releases

| Version    | Status               | Branch / tag                     | Scope                                                                     |
| ---------- | -------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| **v1.0.0** | released 2026-05-05  | tag `v1.0.0` on `main`           | The modernization described below: Phases 1–5 + A–E + WORKSTREAM + rules. |
| **v1.1.0** | in flight            | `feat/v1.1.0-terminal-git`       | Collapsible terminal pane + git awareness. See plan: [terminal_pane_and_git_awareness_9f31fc99.plan.md](/Users/williamsierra-lenhart/.cursor/plans/terminal_pane_and_git_awareness_9f31fc99.plan.md). |

The companion fork
[`justadropofwater/editor-widget`](https://github.com/justadropofwater/editor-widget)
is at **v2.0.0** (default branch `main`), pinned by slap via the tarball at
`vendor/editor-widget-2.0.0.tgz`. See its
[`CHANGELOG.md`](../editor-widget/CHANGELOG.md) for the fork's own release
log.

Each new feature line gets:

1. A feature branch `feat/v<x.y.z>-<short>` cut from the tag of the previous
   release.
2. A `[<x.y.z>] - Unreleased` heading at the top of `CHANGELOG.md`, filled in
   as commits land.
3. A version bump on `package.json` to `<x.y.z>-dev` while the branch is in
   flight, finalized to `<x.y.z>` in the release commit.
4. Annotated git tag and a GitHub release with notes from the CHANGELOG entry.

---

## TL;DR

Slap (`v0.1.61`, 2016, Atom-era Node 4/6 codebase) was unbuildable on modern
Node. Two rounds of work brought it back:

1. **Phases 1–5** (the original `resurrect_slap_editor_b11c004a.plan.md`,
   already merged before this workstream): native addon V8 patches
   (`runas`/`pathwatcher`/`marker-index`), Bluebird → native promises *inside
   slap*, plugin loader, `mkdirp` → `fs.promises.mkdir`, `rc` pinned to 1.2.8,
   ES6-class conversion of `lib/ui/*`, GitHub Actions CI.
2. **Phases A–E** (this workstream): take ownership of the abandoned
   slap-editor satellite packages — `base-widget`, `slap-util`,
   `editor-widget` — that Phase 3 couldn't reach. Inline the small two,
   fork+modernize the big one, consolidate `text-buffer`, finish the Bluebird
   purge (which Phase 3b only achieved at the slap layer; `editor-widget@1.1.1`
   was still nesting its own bluebird via `base-widget@1.0.9`).

End state: `npm install` succeeds in one shot on Node 25, all 175 tests pass,
no Bluebird / `slap-editor/*` deps anywhere in the tree, single
`text-buffer@9.2.2` line.

---

## The two repos

```
~/repos/slap                       # this repo, the editor itself
~/repos/editor-widget              # the editor-widget@2.0.0 fork
                                   # origin: git@github.com:justadropofwater/editor-widget.git
                                   # default branch: main
                                   # tag: v2.0.0
```

`slap` consumes `editor-widget` via a packed tarball at
`vendor/editor-widget-2.0.0.tgz` (35 KB), referenced from `package.json` as
`"editor-widget": "file:./vendor/editor-widget-2.0.0.tgz"`. **Tarball, not
directory.** See [Why a tarball, not `file:../editor-widget`](#why-a-tarball-not-fileeditor-widget) below.

When updating the fork, the workflow is:

```bash
cd ~/repos/editor-widget
# ... edits + commit ...
rm -f editor-widget-2.0.0.tgz
npm pack
cp editor-widget-2.0.0.tgz ~/repos/slap/vendor/
cd ~/repos/slap
rm -rf node_modules package-lock.json && npm install
```

The repack step is essential. If you only edit
`node_modules/editor-widget/...` in slap directly, your changes get blown away
on the next `npm install`.

---

## The dep tree

After everything:

```
slap@1.0.0
├── blessed@0.1.81
├── editor-widget@2.0.0  → file:./vendor/editor-widget-2.0.0.tgz   (our fork)
│   └── text-buffer@9.2.2
│       ├── pathwatcher@6.6.2  → ./vendor/pathwatcher  (V8-patched)
│       └── marker-index@4.0.0 → ./vendor/marker-index (V8-patched)
│           runas@3.1.1        → ./vendor/runas        (V8-patched, via pathwatcher)
├── lodash@4.17.21
├── rc@1.2.8
├── ttys@0.0.3
└── update-notifier@5.1.0  ← do NOT let `npm audit fix --force` rewrite this

# gone (verified with `npm ls`):
bluebird       — fully purged (Phase 3b finished only at slap layer; the
                 nested editor-widget copy was killed in Phase C)
base-widget    — inlined into lib/ui/BaseWidget.js + lib/ui/baseWidgetOpts.js
slap-util      — inlined into lib/util/{text,markup,helpers}.js + lib/slap-util.js
```

The pre-modernization tree had **two** text-buffer copies (8.0.6 nested under
editor-widget, 9.2.2 from base-widget), plus 553 packages and 66 audit
warnings. Now: ~309 packages, single text-buffer, the remaining audit
warnings are all unfixable upstream issues (see [Audit advisories](#audit-advisories)).

---

## Phase-by-phase log

Commits on `master` (slap), most recent last:

| Commit    | Phase | Summary                                                    |
| --------- | ----- | ---------------------------------------------------------- |
| `9ce812a` | A     | inline base-widget, drop external dep                      |
| `773a4d0` | B     | inline slap-util, complete Phase 3f                        |
| `c7447f8` | C     | point editor-widget at modernized fork via vendored tarball |
| `ac352db` | D     | consolidate on single text-buffer version                  |
| `364f380` | E     | phase-6: complete Bluebird removal across satellites       |
| `b663016` | post  | BaseWidget: tolerate missing parent/screen in mixin path   |
| `c69bc45` | post  | follow editor-widget rename master → main                  |

Commits on `main` (editor-widget):

| Commit    | Summary                                                    |
| --------- | ---------------------------------------------------------- |
| `941a598` | modernize: ES6 classes, native async/await, drop slap-editor satellite deps |
| `95addf1` | highlight: switch to highlight.js 11 API                   |
| `8db1738` | BaseWidget: tolerate missing parent/screen in mixin path   |
| `9275762` | ci: track main, drop dead modernize branch                 |

### Phase A — inline `base-widget`

`base-widget@1.1.0` was 140 LOC across two files. It's now `lib/ui/BaseWidget.js`
(ES6 `class BaseWidget extends blessed.Box`) + `lib/ui/baseWidgetOpts.js`
(default focusNext/focusPrev bindings). 13 callsites updated:
`require('base-widget')` → `require('./BaseWidget')`, plus
`require('base-widget').blessed` → `require('blessed')` in `lib/cli.js`.

### Phase B — inline `slap-util`

`slap-util@1.0.7` was 285 LOC across four files. It's now
`lib/util/{text,markup,helpers}.js` plus `lib/slap-util.js` which composes
them and exposes the same surface (`text`, `markup`, `mod`, `typeOf`,
`callBase`, `getterSetter`, `parseOpts`, `resolvePath`, `logger`). The
`traverse` dep was replaced by a small recursive walker in
`lib/util/helpers.js#mapDeep`. 36 new tape assertions in
`spec/slap-util.test.js`.

### Phase C — fork `editor-widget`

The big one. ~914 LOC in `lib/Editor.js` was too big and too entangled with
`text-buffer` to inline; instead it became a separate fork at
`justadropofwater/editor-widget` (default branch `main`, tag `v2.0.0`):

* `Editor` and `Field` rewritten as ES6 classes.
* All bluebird removed: `Promise.method`, `.tap`, `.return`, `.spread`,
  `.done`, `Promise.promisifyAll`, `Promise.try` → native `async`/`await`,
  `util.promisify`, `fs.promises`.
* `base-widget` and `slap-util` inlined into the fork too — it carries its
  own `lib/BaseWidget.js`, `lib/baseWidgetOpts.js`, `lib/util.js`,
  `lib/util/{text,markup,helpers}.js` (intentional duplication of slap's
  copies; see [Why two copies of BaseWidget](#why-two-copies-of-basewidget)).
* `text-buffer` pinned to `9.2.2` (the same version slap used to get via
  base-widget; replaces the nested 8.0.6 that editor-widget@1.1.1 dragged in).
* `cheerio` 1.x, `highlight.js` 11.x.
* `engines: ">=20"`, GitHub Actions CI on Node 20+22.

### Phase D — consolidate `text-buffer`

After Phase C, `npm ls text-buffer` shows exactly one line (9.2.2). The
existing `vendor/` patches for marker-index 4.0.0 and pathwatcher 6.6.2
still apply unchanged. `scripts/patch-native.js` was simplified to skip
silently when overrides have already pinned a native to `vendor/<pkg>` via
symlink.

### Phase E — verify

`npm ls bluebird base-widget slap-util` all return empty. Full test suite
(175 assertions across 9 files) passes. End-to-end smoke test (open + edit +
save) works through the modernized Editor.

---

## Architectural decisions

### Inline vs fork the satellite packages

The user picked **forks** for ownership-model and **consolidate** for
modernization scope. The actual implementation is *hybrid* by size:

| Package         | LOC | Decision                              | Why                                                                                        |
| --------------- | --- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `base-widget`   | 140 | inlined into `lib/ui/`                | Trivially small; no reason to maintain separately.                                         |
| `slap-util`     | 285 | inlined into `lib/util/` + `lib/slap-util.js` | Phase 3f had already half-replaced the logger; finishing was straightforward.       |
| `editor-widget` | 914 + `highlight/` | forked to `justadropofwater/editor-widget` | Big enough to warrant its own repo + tests + CI; entangled with text-buffer. |

### Why a tarball, not `file:../editor-widget`

npm's `file:` directory references symlink the package but **do not install
its transitive deps** in the consumer's `node_modules`. Tested both
explicitly. With `file:./vendor/editor-widget-2.0.0.tgz`, npm treats it like
a regular package install, hoisting `text-buffer`, `cheerio`, `highlight.js`,
etc. into the consumer's `node_modules`.

This means:

- **Source of truth** for editor-widget code is `~/repos/editor-widget`.
- The tarball in `vendor/` is regenerated via `npm pack` — see [The repack workflow](#the-repack-workflow).
- A future improvement is switching to `github:justadropofwater/editor-widget#v2.0.0`
  (now that the repo exists and is pushed); that also installs transitive deps
  correctly. The current tarball just keeps everything reproducible from this
  repo alone.

### npm `overrides` for native addons

`runas`, `pathwatcher`, `marker-index` are V8-patched copies under `vendor/`.
Three things make them work:

1. They're listed as **direct dependencies** (`"runas": "file:./vendor/runas"`)
   so npm has a name to bind the override to.
2. Top-level `overrides` use the `$<name>` self-reference syntax so any
   transitive request for `runas` (e.g. `pathwatcher → runas`) resolves to
   our vendored copy:
   ```json
   "overrides": {
     "runas": "$runas",
     "pathwatcher": "$pathwatcher",
     "marker-index": "$marker-index"
   }
   ```
3. The vendored `package.json` files have their `scripts` and broken
   `devDependencies` (e.g. `electron-prebuilt@^0.30.1`) **stripped**, otherwise
   `npm install` tries to fetch Atom-era electron releases that 404 today.

This replaces the previous fragile postinstall-patch flow.
`scripts/patch-native.js` is now a no-op fallback that skips entirely when
the destination is a symlink to `vendor/<pkg>`.

### Why two copies of `BaseWidget`

`slap` has `lib/ui/BaseWidget.js` and the editor-widget fork has its own
`lib/BaseWidget.js`. Why not share?

Because editor-widget is a *separately publishable* package; it has to be
self-contained. If editor-widget required slap's BaseWidget, it could only
ever be used by slap. By inlining a small (~140 LOC) BaseWidget copy in
both, editor-widget remains a drop-in `Editor` widget for any blessed app.

The two BaseWidget classes both extend `blessed.Box` with the same surface,
so Editor instances (using fork's BaseWidget) coexist as children of slap's
Pane (using slap's BaseWidget) without conflict. They're not ===; they're
parallel implementations of the same protocol.

If this duplication ever becomes a maintenance burden, the answer is to
publish a tiny shared package (`@justadropofwater/blessed-base-widget` or
similar) — but at 140 LOC and stable APIs, that's not justified yet.

### The mixin pattern (`_initBaseWidget`)

Three of slap's UI classes — `Button`, `Label`, `FileBrowser`, `PaneList` —
extend a built-in **blessed** widget (`blessed.Button`, `blessed.Text`,
`blessed.FileManager`, `blessed.List`) instead of `BaseWidget`, because they
need that widget's specific behavior. They still need BaseWidget's `ready`
promise, focus management, bindings, etc.

Pre-modernization (when BaseWidget was a `function`) you could just call it:

```js
function Button(opts) {
  blessed.Button.call(this, opts);
  BaseWidget.call(this, opts);   // mixin
}
```

ES6 classes can't be called as functions. So `BaseWidget` exposes a static
`_initBaseWidget(self, opts)` that does what the legacy function did *minus*
calling the `blessed.Box` constructor:

```js
class Button extends BaseWidget.blessed.Button {
  constructor(opts) {
    opts = _.merge({...}, Slap.global.options.button, opts);
    super(opts);                          // → blessed.Button
    BaseWidget._initBaseWidget(this, opts);  // → ready promise, focusable, logger
  }
}
```

`BaseWidget._initBaseWidget` reads `self.parent` / `self.screen` (which
blessed sets in its constructor via `super(opts)`) instead of
`opts.parent` / `opts.screen`. The mixin path doesn't run BaseWidget's own
opts normalization (`if (!opts.screen) opts.screen = (opts.parent || {}).screen`),
so trusting `opts.*` here would crash with
`Cannot read properties of undefined (reading 'logger')`. (See `b663016`
`BaseWidget: tolerate missing parent/screen in mixin path` — this was a real
bug found running `./slap.js` after the rest was green.)

---

## Bug museum

### `BaseWidget._initBaseWidget` mixin TypeError

**Symptom:** `./slap.js README.md` throws
`TypeError: Cannot read properties of undefined (reading 'logger')` at
`BaseWidget._initBaseWidget` from `new Button` from `new Header` from
`new Slap`.

**Root cause:** The legacy `function BaseWidget(opts)` normalized
`opts.screen = (opts.parent || {}).screen` *before* the logger lookup. After
splitting into a constructor (uses `opts.screen`/`opts.parent` properly) and
a static mixin (does not), the mixin path read `.options.logger` on a
fallback `{}`.

**Fix:** Use `self.parent` / `self.screen` (set by blessed via `super(opts)`)
and guard each `.options` dereference. Both `lib/ui/BaseWidget.js` and the
fork's `lib/BaseWidget.js` have the same fix.

### text-buffer 9.x drops custom marker properties on `markPosition`

**Symptom:** Editor instantiation throws `Error: unknown marker: undefined`
deep in `_updateContent`.

**Root cause:** text-buffer 8.x preserved arbitrary fields passed to
`markPosition(point, options)`; text-buffer 9.x's `markPosition` only
forwards `tailed` and `invalidate` to `markRange`. So
`markPosition(point, {type: 'selection', invalidate: 'never'})` produced a
marker with `properties: {}` instead of `properties: {type: 'selection'}`.

**Fix in editor-widget fork:**

```js
// before
self.selection = self.textBuf.markPosition(p, { type: 'selection', invalidate: 'never' });
// after
self.selection = self.textBuf.markPosition(p, { invalidate: 'never' });
self.selection.setProperties({ type: 'selection' });
```

`markRange` *does* still extract custom properties (with a deprecation
warning); only `markPosition` is broken. So `editor.textBuf.markRange(range, {type: 'findMatch'})`
in slap's `FindForm` still works as-is.

### `electron-prebuilt@^0.30.1` 404s on fresh install

**Symptom:** `npm install` fails with
`Error: GET https://github.com/atom/electron/releases/download/v0.30.8/electron-v0.30.8-darwin-arm64.zip returned 404`.

**Root cause:** The vendored `marker-index/package.json` listed
`electron-prebuilt: ^0.30.1` as a devDep with a `prepublish` script that
triggered electron download. With newer npm, `file:` directory deps run
their `prepare`/`prepublish` lifecycle, which kicked off the download.

**Fix:** Strip `scripts` and `devDependencies` from
`vendor/{runas,pathwatcher,marker-index}/package.json`. They're vendored
build artifacts, not packages we want to develop in-tree.

### `npm audit fix --force` swaps editor-widget for the abandoned npm publish

**Symptom:** `npm audit fix --force` rewrote `package.json` to bump
`update-notifier: 5.1.0 → ^7.3.1` and tried to consider replacing our
vendored editor-widget tarball with `editor-widget@1.0.13` from npm — the
exact abandoned package the whole modernization escaped.

**Don't do it.** Run `npm audit` (read-only) or `npm audit fix` (no `--force`)
which respects semver-major boundaries. The remaining advisories are
unfixable upstream:

#### Audit advisories

* `diff <=3.5.0` — pulled by `text-buffer@9.2.2`. ReDoS in
  `parsePatch`/`applyPatch`. Slap doesn't call those.
* `lodash <=4.17.23` — `_.template` injection. Slap doesn't use `_.template`.
* The "editor-widget 1.0.13 - 1.0.14" mention is npm's vulnerability
  *range* data; we have 2.0.0 installed.

---

## Testing

Slap has 9 test files / 175 assertions. `npm test` only wires up 5 of them
(it predates the post-Phase-3 additions). Run all of them with:

```bash
cd ~/repos/slap
for f in spec/native/runas.test.js \
         spec/native/pathwatcher.test.js \
         spec/native/marker-index.test.js \
         spec/ui/FindForm.js \
         spec/ui/class-migration.test.js \
         spec/async-migration.test.js \
         spec/mkdir-recursive.test.js \
         spec/plugin-loader.test.js \
         spec/slap-util.test.js; do
  echo "=== $f ===" && node "$f" | tail -3
done
```

`spec/cli.js` (and therefore `npm test`) requires a real `/dev/tty` because
`lib/cli.js` imports `ttys`. Inside agent contexts / CI without a PTY, run
the individual files above. From a real terminal, `npm test` works.

End-to-end smoke: `./slap.js README.md`. Verify mouse, syntax highlighting,
`Ctrl+S`, `Ctrl+Z`/`Ctrl+Y`, `Ctrl+F`, `Ctrl+L`, `Ctrl+Q`.

---

## Outstanding follow-ups

* **Wire all 9 test files into `npm test`.** `spec/index.js` only requires
  5 of the 9. One-line change.
* **Switch from tarball to `github:` reference.** Now that the fork is
  pushed, `"editor-widget": "github:justadropofwater/editor-widget#v2.0.0"`
  works equivalently. The tarball is currently the source of truth so
  flipping the reference and deleting the tarball is fine whenever convenient.
* **Clean up the highlight client subprocess on exit.** End-to-end smoke
  test exits but leaves the highlight subprocess running until something
  emits an EPIPE. Not user-visible but annoying.
* **Test on Linux + Windows.** All testing so far is macOS arm64.

---

## Reference: file map

```
slap/
  WORKSTREAM.md                 ← this file
  .cursor/rules/                ← persistent agent guidance, see below
  README.md                     ← user-facing docs
  package.json                  ← deps + overrides + scripts
  slap.ini                      ← default config (key bindings, styles)
  default-config.ini            ← seed for ~/.slap/config

  lib/
    cli.js                      ← entrypoint, parses opts, boots Slap
    plugin-loader.js            ← Phase 3a custom loader (replaces node-clap)
    slap-util.js                ← composes lib/util/* + the streaming logger
    util/
      text.js                   ← splitLines, regExp{Index,LastIndex}Of
      markup.js                 ← {bold}tags{/bold} parser
      helpers.js                ← mod, typeOf, callBase, getterSetter,
                                  parseOpts, resolvePath
    ui/
      BaseWidget.js             ← ES6 class, ex-base-widget; static
                                  _initBaseWidget mixin for non-BaseWidget
                                  extenders
      baseWidgetOpts.js         ← default focusNext/focusPrev bindings
      Slap.js                   ← top-level UI; extends BaseWidget
      Pane.js, EditorPane.js, PaneList.js,
        Header.js, FileBrowser.js,
        BaseForm.js, BaseFindForm.js, FindForm.js,
        GoLineForm.js, SaveAsForm.js, SaveAsCloseForm.js,
        Button.js, Label.js     ← all ES6 classes, see widget-conventions rule

  scripts/
    patch-native.js             ← no-op fallback when overrides apply

  spec/                         ← tape-based tests
  vendor/
    editor-widget-2.0.0.tgz     ← packed fork; regenerate with `npm pack` in ~/repos/editor-widget
    runas/                      ← V8-patched, scripts/devDeps stripped
    pathwatcher/                ← V8-patched, scripts/devDeps stripped
    marker-index/               ← V8-patched, scripts/devDeps stripped
```

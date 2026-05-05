# Changelog

All notable changes to this fork of slap are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

(Nothing here on `main`; see the `[1.1.0] - Unreleased` section below for
the in-flight branch state.)

## [1.1.0] - Unreleased

In flight on the
[`feat/v1.1.0-terminal-git`](https://github.com/justadropofwater/slap/tree/feat/v1.1.0-terminal-git)
branch. Plan:
[terminal_pane_and_git_awareness_9f31fc99.plan.md](https://github.com/justadropofwater/slap/blob/feat/v1.1.0-terminal-git/WORKSTREAM.md).

### Planned (Added)

- **Phase 1** — Collapsible terminal pane with subprocess-mode command
  runner. New `lib/ui/TerminalPane.js`, default toggle binding `F12`,
  bottom horizontal split layout. Slap, Pane, Header all updated to
  cooperate with the new pane's resize semantics.
- **Phase 2a** — Git awareness in the header: current branch and
  unstaged-change count rendered in the right-content of `lib/ui/Header.js`,
  refreshed on save / debounced edit / 5-second poll. New thin `lib/git.js`
  shelling out to `git`.
- **Phase 2b** — Per-line git diff markers in the editor gutter (added,
  modified, deleted). Touches the editor-widget@2.0.0 fork's
  `lib/Editor.js` (will produce a v2.1.0 of the fork).
- **Phase 3** — Real-PTY shell mode in `TerminalPane` via `node-pty`,
  toggleable while the pane is focused. Light ANSI renderer for v1.1.0;
  full xterm-class rendering deferred to a later release if needed.

## [1.0.0] - 2026-05-05

First release of the modernized fork. Slap now builds, installs, and runs
on Node 20+ (verified through Node 25) while keeping every feature of
[v0.1.61](https://github.com/slap-editor/slap/releases/tag/v0.1.61) intact.

### Native addons

- `runas` (3.1.1), `pathwatcher` (6.6.2), and `marker-index` (4.0.0)
  V8-patched for modern C++20 / Node 20+ APIs (Isolate-aware
  `BooleanValue`, context-aware `Get`/`Set`, `Local<T>` instead of
  `Handle<T>`, `Nan::To<...>` etc.). Patched copies live under
  [`vendor/`](vendor/) and are wired in via
  [npm `overrides`](package.json) using the `$<name>` self-reference
  syntax, so a fresh `npm install` succeeds in one shot — no postinstall
  rebuild dance, no `node-gyp` errors.

### Promises

- Bluebird removed everywhere. Slap-layer purge (Phase 3b) and the inside
  of the modernized
  [editor-widget@2.0.0](https://github.com/justadropofwater/editor-widget)
  fork (Phase E) both use native `async`/`await`, `util.promisify`, and
  `fs.promises`. `npm ls bluebird` is now empty.

### Satellite packages brought in-house

- [`base-widget`](https://github.com/slap-editor/base-widget) (140 LOC)
  inlined as [`lib/ui/BaseWidget.js`](lib/ui/BaseWidget.js) +
  [`lib/ui/baseWidgetOpts.js`](lib/ui/baseWidgetOpts.js).
- [`slap-util`](https://github.com/slap-editor/slap-util) (285 LOC)
  inlined as [`lib/util/{text,markup,helpers}.js`](lib/util/) plus
  [`lib/slap-util.js`](lib/slap-util.js). The `traverse` dep was
  replaced by a small recursive walker.
- [`editor-widget`](https://github.com/slap-editor/editor-widget) forked
  to [`justadropofwater/editor-widget@2.0.0`](https://github.com/justadropofwater/editor-widget):
  ES6 classes, no Bluebird, self-contained (no external base-widget /
  slap-util), `text-buffer` pinned to 9.2.2, GitHub Actions CI on Node
  20+22. Consumed by slap as a packed tarball at
  [`vendor/editor-widget-2.0.0.tgz`](vendor/editor-widget-2.0.0.tgz)
  (35 KB).

### Dependency tree

- `text-buffer` consolidated to a single 9.2.2 line. Previously, slap had
  two text-buffer copies (9.2.2 from `base-widget`, 8.0.6 nested under
  `editor-widget@1.1.1`).
- `node-clap` replaced by [`lib/plugin-loader.js`](lib/plugin-loader.js)
  (Phase 3a custom loader).
- `mkdirp` replaced by built-in
  `fs.promises.mkdir(p, { recursive: true })` (Phase 3c).
- `rc` pinned to safe `1.2.8` (Phase 3e); `lodash` bumped to `4.17.21`
  (Phase 4c).

### Application code

- All 14 UI widget files in [`lib/ui/`](lib/ui/) converted from prototype
  inheritance (`Foo.prototype.__proto__ = Bar.prototype`) to ES6
  `class Foo extends Bar`. The
  `BaseWidget.call(self, opts)` mixin pattern used by widgets that extend
  a built-in blessed widget instead of `BaseWidget` is replaced by a
  `BaseWidget._initBaseWidget(self, opts)` static helper; see
  [`.cursor/rules/widget-conventions.mdc`](.cursor/rules/widget-conventions.mdc).

### Toolchain & docs

- Node engines: `>=20`; Travis CI replaced by GitHub Actions on Node 20
  and 22.
- 175 [tape](https://github.com/ljharb/tape) assertions across 9 test
  files: 3 native addon suites, plus plugin loader, async migration,
  mkdir-recursive, FindForm regex, class-migration, slap-util.
- [`WORKSTREAM.md`](WORKSTREAM.md) carries the full architectural
  context (decisions, bugs found, gotchas) for future contributors.
- Four [`.cursor/rules/`](.cursor/rules/) files guide AI agents working
  on this codebase: `repo-architecture.mdc`, `native-deps.mdc`,
  `widget-conventions.mdc`, `modernization-patterns.mdc`.

### Backwards-incompatible

- Drops support for Node 4/6/8 (the original v0.1.61 target). Plugins
  written against the original Bluebird-promised `slap.ready` chain may
  need to be updated to native promise semantics; see Phase 3b notes
  in [WORKSTREAM.md](WORKSTREAM.md).

[Unreleased]: https://github.com/justadropofwater/slap/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/justadropofwater/slap/releases/tag/v1.0.0

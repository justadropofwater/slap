#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var root = path.join(__dirname, '..');
var vendor = path.join(root, 'vendor');
var nm = path.join(root, 'node_modules');

// Patches map vendored fixed sources onto packages that pull in deprecated V8
// APIs. Normally the npm `overrides` in package.json pin these packages to our
// vendor/ copies via symlink, so this script is a no-op fallback for installs
// where overrides didn't take effect (older npm, hoisting quirks, etc.).
//
// Patches are skipped silently when:
//   * the package isn't in the tree
//   * the destination is already a symlink to our vendor/ copy
//   * the destination layout doesn't match (e.g. the now-pure-JS marker-index
//     2.x has no src/, so its native patch isn't applicable to that version)
var patches = [
  { pkg: 'runas',        files: ['src/main.cc', 'binding.gyp'] },
  { pkg: 'pathwatcher',  files: ['src/common.cc', 'src/common.h', 'src/handle_map.cc', 'src/main.cc', 'binding.gyp'] },
  { pkg: 'marker-index', files: ['src/native/marker-index-wrapper.cc', 'binding.gyp'] }
];

function isVendorSymlink(pkgDir) {
  try {
    var stats = fs.lstatSync(pkgDir);
    if (!stats.isSymbolicLink()) return false;
    var target = fs.realpathSync(pkgDir);
    return target.startsWith(vendor + path.sep);
  } catch (e) {
    return false;
  }
}

patches.forEach(function (patch) {
  var dest = path.join(nm, patch.pkg);
  if (!fs.existsSync(dest)) return;
  if (isVendorSymlink(dest)) return; // overrides already pinned this to vendor/

  var copied = 0;
  patch.files.forEach(function (file) {
    var src = path.join(vendor, patch.pkg, file);
    var dst = path.join(dest, file);
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(path.dirname(dst))) return;
    fs.copyFileSync(src, dst);
    copied++;
  });

  if (!copied) {
    console.log('Skipping ' + patch.pkg + ' (no native sources to patch).');
    return;
  }

  console.log('Rebuilding ' + patch.pkg + '...');
  cp.execSync('npm rebuild ' + patch.pkg, { cwd: root, stdio: 'inherit' });
});

console.log('Native addon patches checked.');

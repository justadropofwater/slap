#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var root = path.join(__dirname, '..');
var vendor = path.join(root, 'vendor');
var nm = path.join(root, 'node_modules');

// Patches map vendored fixed sources onto packages that pull in deprecated V8
// APIs. We only apply a patch if the destination directory layout matches
// (i.e. the file exists at the same path), otherwise we silently skip it --
// e.g. marker-index 2.x is pure JS and ships no src/, so its patch is a no-op
// for that version.
var patches = [
  { pkg: 'runas',        files: ['src/main.cc', 'binding.gyp'] },
  { pkg: 'pathwatcher',  files: ['src/common.cc', 'src/common.h', 'src/handle_map.cc', 'src/main.cc', 'binding.gyp'] },
  { pkg: 'marker-index', files: ['src/native/marker-index-wrapper.cc', 'binding.gyp'] }
];

patches.forEach(function (patch) {
  var dest = path.join(nm, patch.pkg);
  if (!fs.existsSync(dest)) return;

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

console.log('Native addon patches applied successfully.');

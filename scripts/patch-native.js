#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var root = path.join(__dirname, '..');
var vendor = path.join(root, 'vendor');
var nm = path.join(root, 'node_modules');

var patches = [
  { pkg: 'runas', files: ['src/main.cc', 'binding.gyp'] },
  { pkg: 'pathwatcher', files: ['src/common.cc', 'src/common.h', 'src/handle_map.cc', 'src/main.cc', 'binding.gyp'] },
  { pkg: 'marker-index', files: ['src/native/marker-index-wrapper.cc', 'binding.gyp'] },
];

patches.forEach(function (patch) {
  var dest = path.join(nm, patch.pkg);
  if (!fs.existsSync(dest)) return;

  patch.files.forEach(function (file) {
    var src = path.join(vendor, patch.pkg, file);
    var dst = path.join(dest, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  });

  console.log('Rebuilding ' + patch.pkg + '...');
  cp.execSync('npm rebuild ' + patch.pkg, { cwd: root, stdio: 'inherit' });
});

console.log('Native addon patches applied successfully.');

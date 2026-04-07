var fs = require('fs');
var path = require('path');

function loadPlugins(opts) {
  var val = opts.val;
  var keyword = opts.keyword;
  var searchPaths = opts.paths || [];
  var results = [];

  searchPaths.forEach(function (searchPath) {
    var entries;
    try {
      entries = fs.readdirSync(searchPath);
    } catch (e) {
      return;
    }

    entries.forEach(function (entry) {
      var fullPath = path.join(searchPath, entry);
      var pkgPath = path.join(fullPath, 'package.json');
      var pkg;

      try {
        var stat = fs.statSync(fullPath);
        if (stat.isFile() && entry.endsWith('.js')) {
          results.push({
            plugin: fullPath,
            promise: safeRequirePlugin(fullPath, val)
          });
          return;
        }
        if (!stat.isDirectory()) return;
      } catch (e) {
        return;
      }

      try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch (e) {
        return;
      }

      if (keyword && Array.isArray(pkg.keywords) && pkg.keywords.indexOf(keyword) === -1) {
        return;
      }

      results.push({
        plugin: pkg.name || entry,
        promise: safeRequirePlugin(fullPath, val)
      });
    });
  });

  return Promise.resolve(results);
}

function safeRequirePlugin(pluginPath, val) {
  return new Promise(function (resolve, reject) {
    try {
      var pluginFn = require(pluginPath);
      if (typeof pluginFn === 'function') {
        var maybePromise = pluginFn(val);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve, reject);
        } else {
          resolve(maybePromise);
        }
      } else {
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = loadPlugins;

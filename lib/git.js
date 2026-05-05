var execFile = require('child_process').execFile;
var path = require('path');

// Thin async wrappers around `git`. All functions resolve with a "no repo /
// no info" sentinel rather than rejecting when run outside a git work tree,
// so callers don't have to special-case the not-a-repo case on every call.
//
// Results are briefly cached per-(cwd, args, filepath) to avoid hammering
// git on every keystroke.

var DEFAULT_TTL_MS = 500;
var cache = new Map();

function cacheKey(cwd, args) { return cwd + '\0' + args.join('\0'); }

function gitExec(cwd, args, opts) {
  opts = opts || {};
  var ttl = opts.ttl != null ? opts.ttl : DEFAULT_TTL_MS;
  var key = cacheKey(cwd, args);
  if (ttl > 0) {
    var cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
  }

  var promise = new Promise(function (resolve) {
    execFile('git', args, { cwd: cwd, maxBuffer: 1024 * 1024 }, function (err, stdout, stderr) {
      if (err) {
        // ENOENT -> git not on PATH; non-zero exit -> not a repo or other error.
        // Either way, surface a structured failure rather than throwing.
        resolve({ ok: false, error: err, stderr: stderr || '' });
        return;
      }
      resolve({ ok: true, stdout: stdout || '' });
    });
  });

  if (ttl > 0) {
    cache.set(key, { promise: promise, expiresAt: Date.now() + ttl });
  }
  return promise;
}

function clearCache() { cache.clear(); }

async function getBranch(cwd) {
  var res = await gitExec(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!res.ok) return null;
  var name = res.stdout.trim();
  return name || null;
}

// Parse `git status --porcelain=v2 --branch` for branch + ahead/behind +
// modified/untracked counts. Format docs: man git-status.
async function getStatus(cwd) {
  var res = await gitExec(cwd, ['status', '--porcelain=v2', '--branch']);
  if (!res.ok) return null;

  var status = {
    branch: null,
    ahead: 0,
    behind: 0,
    modified: 0,
    staged: 0,
    untracked: 0,
    conflicted: 0,
  };

  res.stdout.split('\n').forEach(function (line) {
    if (!line) return;
    if (line.startsWith('# branch.head ')) {
      status.branch = line.slice('# branch.head '.length).trim();
    } else if (line.startsWith('# branch.ab ')) {
      var m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) { status.ahead = +m[1]; status.behind = +m[2]; }
    } else if (line[0] === '1' || line[0] === '2') {
      // Ordinary changed (1) or renamed (2) entry. Format:
      //   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      // X = staged status, Y = worktree status.
      var parts = line.split(' ');
      var xy = parts[1] || '..';
      if (xy[0] !== '.') status.staged++;
      if (xy[1] !== '.') status.modified++;
    } else if (line[0] === 'u') {
      status.conflicted++;
    } else if (line[0] === '?') {
      status.untracked++;
    }
  });

  status.dirty = status.modified > 0 || status.staged > 0
    || status.conflicted > 0 || status.untracked > 0;
  return status;
}

// Parse `git diff -U0 --no-color HEAD -- <filepath>` hunk headers into
// per-row Sets of {added, modified, deleted} for the gutter renderer.
//
// Hunk header form: @@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@
//   - oldCount=0 newCount>0  -> pure addition
//   - oldCount>0 newCount=0  -> pure deletion (gutter mark sits on the row
//                                where the deletion *was* preceded)
//   - both > 0               -> modification spanning newCount rows
async function getLineDiff(cwd, filepath) {
  if (!filepath) return null;
  var rel = path.relative(cwd, filepath);
  var res = await gitExec(cwd, ['diff', '-U0', '--no-color', 'HEAD', '--', rel]);
  if (!res.ok) return null;

  var added = new Set();
  var modified = new Set();
  var deletedAtRow = new Set();

  var hunkRe = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  res.stdout.split('\n').forEach(function (line) {
    var m = hunkRe.exec(line);
    if (!m) return;
    var oldCount = m[2] != null ? +m[2] : 1;
    var newStart = +m[3];
    var newCount = m[4] != null ? +m[4] : 1;
    var newRow0 = Math.max(0, newStart - 1);
    if (newCount === 0) {
      deletedAtRow.add(newRow0);
    } else if (oldCount === 0) {
      for (var i = 0; i < newCount; i++) added.add(newRow0 + i);
    } else {
      for (var j = 0; j < newCount; j++) modified.add(newRow0 + j);
    }
  });

  return { added: added, modified: modified, deletedAtRow: deletedAtRow };
}

module.exports = {
  getBranch: getBranch,
  getStatus: getStatus,
  getLineDiff: getLineDiff,
  clearCache: clearCache,
  _exec: gitExec,
};

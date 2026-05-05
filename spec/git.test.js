var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var execFile = require('child_process').execFile;

var git = require('../lib/git');

function run(cmd, args, cwd) {
  return new Promise(function (resolve, reject) {
    execFile(cmd, args, { cwd: cwd }, function (err, stdout, stderr) {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

async function makeRepo() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slap-git-test-'));
  await run('git', ['init', '-q', '-b', 'main'], dir);
  await run('git', ['config', 'user.email', 'test@example.com'], dir);
  await run('git', ['config', 'user.name', 'Test'], dir);
  await run('git', ['config', 'commit.gpgsign', 'false'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\nfour\n');
  await run('git', ['add', 'a.txt'], dir);
  await run('git', ['commit', '-q', '-m', 'init'], dir);
  return dir;
}

test('git.getBranch returns current branch in a repo', async function (t) {
  git.clearCache();
  var dir = await makeRepo();
  t.equal(await git.getBranch(dir), 'main', 'main on fresh init');
  await run('git', ['checkout', '-q', '-b', 'feature'], dir);
  git.clearCache();
  t.equal(await git.getBranch(dir), 'feature', 'reads current branch after checkout');
  t.end();
});

test('git.getBranch returns null outside a repo', async function (t) {
  git.clearCache();
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slap-git-not-repo-'));
  t.equal(await git.getBranch(dir), null, 'null when not a repo');
  t.end();
});

test('git.getStatus reports clean repo correctly', async function (t) {
  git.clearCache();
  var dir = await makeRepo();
  var s = await git.getStatus(dir);
  t.equal(s.branch, 'main', 'branch detected');
  t.equal(s.dirty, false, 'clean repo');
  t.equal(s.modified, 0, 'no modified files');
  t.equal(s.staged, 0, 'no staged files');
  t.equal(s.untracked, 0, 'no untracked files');
  t.end();
});

test('git.getStatus counts modified, staged, and untracked', async function (t) {
  git.clearCache();
  var dir = await makeRepo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo-modified\nthree\nfour\n');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'untracked\n');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'staged\n');
  await run('git', ['add', 'c.txt'], dir);
  git.clearCache();
  var s = await git.getStatus(dir);
  t.equal(s.dirty, true, 'dirty');
  t.equal(s.modified, 1, '1 modified');
  t.equal(s.staged, 1, '1 staged');
  t.equal(s.untracked, 1, '1 untracked');
  t.end();
});

test('git.getLineDiff parses pure additions', async function (t) {
  git.clearCache();
  var dir = await makeRepo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\ntwo\nthree\nfour\nfive\nsix\n');
  git.clearCache();
  var diff = await git.getLineDiff(dir, path.join(dir, 'a.txt'));
  t.ok(diff.added.has(4), 'row 4 (0-indexed: line 5) is added');
  t.ok(diff.added.has(5), 'row 5 is added');
  t.equal(diff.modified.size, 0, 'no modifications');
  t.end();
});

test('git.getLineDiff parses modifications', async function (t) {
  git.clearCache();
  var dir = await makeRepo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\nTWO-CHANGED\nthree\nfour\n');
  git.clearCache();
  var diff = await git.getLineDiff(dir, path.join(dir, 'a.txt'));
  t.ok(diff.modified.has(1), 'row 1 (line 2) is modified');
  t.equal(diff.added.size, 0, 'no pure additions');
  t.end();
});

test('git.getLineDiff parses deletions', async function (t) {
  git.clearCache();
  var dir = await makeRepo();
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\nthree\nfour\n');
  git.clearCache();
  var diff = await git.getLineDiff(dir, path.join(dir, 'a.txt'));
  t.equal(diff.deletedAtRow.size, 1, 'one deletion marker');
  t.end();
});

test('git.getLineDiff returns null for files outside a repo', async function (t) {
  git.clearCache();
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slap-git-not-repo-'));
  fs.writeFileSync(path.join(dir, 'plain.txt'), 'hello\n');
  t.equal(await git.getLineDiff(dir, path.join(dir, 'plain.txt')), null, 'null outside repo');
  t.end();
});

test('git: cached calls share the same promise within TTL', async function (t) {
  git.clearCache();
  var dir = await makeRepo();
  var p1 = git._exec(dir, ['rev-parse', 'HEAD']);
  var p2 = git._exec(dir, ['rev-parse', 'HEAD']);
  t.equal(p1, p2, 'identical promise reference within TTL');
  await p1;
  t.end();
});

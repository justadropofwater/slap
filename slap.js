#!/usr/bin/env node

module.exports = require('./lib/cli')().catch(function (err) {
  console.error(err.stack || err);
  process.exit(1);
});

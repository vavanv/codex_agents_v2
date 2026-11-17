'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeProject } = require('./helpers/project.cjs');
const { manage } = require('../scripts/manage-install.cjs');
const { spawnSync } = require('node:child_process');
test('preview does not write; install preserves instructions; changed files block uninstall', () => {
  const { root } = makeProject();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'existing instructions');
  manage('install', root, true);
  assert.equal(fs.existsSync(path.join(root, '.codex')), false);
  manage('install', root);
  const smoke = spawnSync(process.execPath, [path.join(root, '.codex/dev-gate/gate/gate.cjs'), 'status', '--project', root], {
    encoding: 'utf8', env: { ...process.env, CODEX_GATE_HOME: path.join(root, 'isolated-evidence') }, windowsHide: true,
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'existing instructions');
  assert.throws(() => manage('install', root), /already exists/);
  const file = path.join(root, '.codex/dev-gate/gate/gate.cjs');
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, '// changed');
  assert.throws(() => manage('uninstall', root), /changed/);
  fs.writeFileSync(file, original);
  manage('uninstall', root, true);
  assert.ok(fs.existsSync(file));
  manage('uninstall', root);
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'existing instructions');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeProject } = require('./helpers/project.cjs');
const { manage } = require('../scripts/manage-install.cjs');
const { spawnSync } = require('node:child_process');
test('preview does not write; install backs up and extends instructions; uninstall restores them', () => {
  const { root } = makeProject();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'existing instructions');
  manage('install', root, true);
  assert.equal(fs.existsSync(path.join(root, '.codex')), false);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.copy.md')), false);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'existing instructions');
  manage('install', root);
  const smoke = spawnSync(process.execPath, [path.join(root, '.codex/dev-gate/gate/gate.cjs'), 'status', '--project', root], {
    encoding: 'utf8', env: { ...process.env, CODEX_GATE_HOME: path.join(root, 'isolated-evidence') }, windowsHide: true,
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.copy.md'), 'utf8'), 'existing instructions');
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /^existing instructions\n\n<!-- codex-dev-gate:start -->/);
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /three distinct real agent sessions/);
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
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.copy.md')), false);
});

test('without original instructions install creates AGENTS.md and uninstall removes it', () => {
  const { root } = makeProject();
  manage('install', root);
  assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /Use the installed development gate/);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.copy.md')), false);
  manage('uninstall', root, true);
  assert.ok(fs.existsSync(path.join(root, 'AGENTS.md')));
  manage('uninstall', root);
  assert.equal(fs.existsSync(path.join(root, 'AGENTS.md')), false);
});

test('existing backups block installation before any writes', () => {
  const { root } = makeProject();
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'original');
  fs.writeFileSync(path.join(root, 'AGENTS.copy.md'), 'valuable backup');
  for (const preview of [true, false]) assert.throws(() => manage('install', root, preview), /AGENTS.copy.md already exists/);
  assert.equal(fs.existsSync(path.join(root, '.codex')), false);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.copy.md'), 'utf8'), 'valuable backup');
});

test('modified instructions or backup stop uninstall before managed files are removed', () => {
  for (const name of ['AGENTS.md', 'AGENTS.copy.md']) {
    const { root } = makeProject();
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'original');
    manage('install', root);
    fs.appendFileSync(path.join(root, name), '\nuser edits');
    for (const preview of [true, false]) assert.throws(() => manage('uninstall', root, preview), /changed or is missing/);
    assert.ok(fs.existsSync(path.join(root, '.codex/dev-gate/gate/gate.cjs')));
    assert.match(fs.readFileSync(path.join(root, name), 'utf8'), /user edits/);
  }
});

test('original UTF-8 BOM, Unicode and CRLF bytes round-trip exactly', () => {
  const { root } = makeProject();
  const original = Buffer.from('\uFEFF# Project\r\nPreserve café instructions.\r\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), original);
  manage('install', root);
  assert.deepEqual(fs.readFileSync(path.join(root, 'AGENTS.copy.md')), original);
  manage('uninstall', root);
  assert.deepEqual(fs.readFileSync(path.join(root, 'AGENTS.md')), original);
});

test('legacy installations uninstall without modifying project instructions', () => {
  const { root } = makeProject();
  manage('install', root);
  const manifest = path.join(root, '.codex/dev-gate/installation.json');
  const record = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  record.version = 1;
  delete record.agents;
  fs.writeFileSync(manifest, JSON.stringify(record));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'legacy project instructions');
  manage('uninstall', root);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), 'legacy project instructions');
});

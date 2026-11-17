'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { makeProject } = require('./helpers/project.cjs');
const gate = path.resolve(__dirname, '../gate/gate.cjs');
function command(p, args, input) {
  return spawnSync(process.execPath, [gate, ...args, '--project', p.root], {
    cwd: p.root, env: { ...process.env, CODEX_GATE_HOME: p.home },
    input: input && JSON.stringify(input), encoding: 'utf8', windowsHide: true,
  });
}
function init(p) {
  const r = command(p, ['init'], {
    task: 'Change a.txt', acceptance: ['a.txt says changed'], scope: ['src/**'], maxRepairs: 0,
    checks: [{ id: 'unit', kind: 'test', parser: 'unittest', command: `node -e "console.log('Ran 1 test in 0.01s');console.log('OK')"` }],
  });
  assert.equal(r.status, 0, r.stderr);
}
function stage(p, action, role, review) {
  return command(p, [action], { role, agentId: `observed-${role}`, review });
}
test('full explicit workflow records checks, candidate and reports', () => {
  const p = makeProject(); init(p);
  assert.notEqual(stage(p, 'start', 'reviewer').status, 0);
  assert.equal(stage(p, 'start', 'implementer').status, 0);
  fs.writeFileSync(path.join(p.root, 'src/a.txt'), 'changed\n');
  assert.equal(stage(p, 'finish', 'implementer').status, 0);
  assert.equal(stage(p, 'start', 'validator').status, 0);
  const check = command(p, ['validate', '--check', 'unit']);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(stage(p, 'finish', 'validator').status, 0);
  assert.equal(stage(p, 'start', 'reviewer').status, 0);
  assert.equal(stage(p, 'finish', 'reviewer', { verdict: 'APPROVE', findings: [], coverage: [{ criterion: 1, by: 'inspection', where: 'src/a.txt: inspected candidate' }] }).status, 0);
  const report = command(p, ['report']);
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /# Result: PASS/);
  assert.match(report.stdout, /checked only by reading/);
  assert.doesNotMatch(report.stdout, /reviewer gave no readable coverage list/);
  const evidence = /Evidence folder: `([^`]+)`/.exec(report.stdout)[1];
  const saved = JSON.parse(fs.readFileSync(path.join(evidence, 'report.json'), 'utf8'));
  assert.deepEqual(saved.review.coverage, [{ criterion: 1, by: 'reading', where: 'src/a.txt: inspected candidate' }]);
  assert.equal(saved.coverage[0].by, 'reading');
});
test('candidate drift cannot inherit passing validation', () => {
  const p = makeProject(); init(p);
  stage(p, 'start', 'implementer');
  fs.writeFileSync(path.join(p.root, 'src/a.txt'), 'candidate');
  stage(p, 'finish', 'implementer');
  fs.writeFileSync(path.join(p.root, 'src/a.txt'), 'late edit');
  assert.notEqual(stage(p, 'start', 'validator').status, 0);
  assert.match(command(p, ['report']).stdout, /# Result: FAILED/);
});
test('missing checks and out of scope changes cannot pass', () => {
  for (const outside of [true, false]) {
    const p = makeProject(); init(p); stage(p, 'start', 'implementer');
    if (outside) fs.writeFileSync(path.join(p.root, 'other.txt'), 'outside scope');
    stage(p, 'finish', 'implementer');
    if (!outside) { stage(p, 'start', 'validator'); stage(p, 'finish', 'validator'); }
    assert.match(command(p, ['report']).stdout, outside ? /# Result: FAILED/ : /# Result: UNVERIFIED/);
  }
});
test('reused identities and unapproved check identifiers are refused', () => {
  const p = makeProject(); init(p);
  stage(p, 'start', 'implementer');
  fs.writeFileSync(path.join(p.root, 'src/a.txt'), 'candidate');
  stage(p, 'finish', 'implementer');
  assert.notEqual(command(p, ['start'], { role: 'validator', agentId: 'observed-implementer' }).status, 0);
  stage(p, 'start', 'validator');
  // The approved command remains fixed; an unapproved check identifier is refused.
  assert.notEqual(command(p, ['validate', '--check', 'invented']).status, 0);
});
test('a successful command reporting zero tests cannot pass', () => {
  const p = makeProject();
  const initialized = command(p, ['init'], {
    task: 'Change a.txt', acceptance: ['changed'], scope: ['src/**'], checkBefore: false,
    checks: [{ id: 'empty', kind: 'test', parser: 'unittest', command: `node -e "console.log('Ran 0 tests in 0.01s');console.log('OK')"` }],
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  stage(p, 'start', 'implementer');
  fs.writeFileSync(path.join(p.root, 'src/a.txt'), 'candidate');
  stage(p, 'finish', 'implementer'); stage(p, 'start', 'validator');
  command(p, ['validate', '--check', 'empty']);
  const report = command(p, ['report']);
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /# Result: UNVERIFIED/);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readCodexRuntime, parseConfig } = require('../scripts/read-codex-runtime.cjs');

const PROJECT = path.resolve(__dirname, '..');
const SCRIPT = path.join(PROJECT, 'scripts', 'read-codex-runtime.cjs');
const CHILD = '22222222-2222-4222-8222-222222222222';
const PARENT = '11111111-1111-4111-8111-111111111111';
const ROLE = 'quick_implementer';
const scratches = [];
let scratch;

function setup() {
  scratch = fs.mkdtempSync(path.join(__dirname, '.runtime-reader-test-'));
  scratches.push(scratch);
  const config = path.join(scratch, `${ROLE}.toml`);
  fs.writeFileSync(config, `name = "${ROLE}"\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "medium"\ndescription = "fixture"\ndeveloper_instructions = """\nFixture instructions.\n"""\n`, 'utf8');
  const rollout = path.join(scratch, 'rollout.jsonl');
  const options = { rollout, config, projectRoot: PROJECT, threadId: CHILD, parentThreadId: PARENT, role: ROLE };
  return { rollout, config, options };
}
function envelope(type, payload) { return JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', type, payload }); }
function meta(extra = {}) {
  return { id: CHILD, cwd: PROJECT, parent_thread_id: PARENT, agent_role: ROLE, ...extra };
}
function turn(id = 'turn-a', extra = {}) {
  return { turn_id: id, cwd: PROJECT, model: 'gpt-6-luna', effort: 'medium', ...extra };
}
function write(rollout, records, newline = true) {
  fs.writeFileSync(rollout, records.join('\n') + (newline ? '\n' : ''), 'utf8');
}
function run(records, opts = {}) {
  const ctx = setup();
  write(ctx.rollout, records);
  return { ...ctx, report: readCodexRuntime({ ...ctx.options, ...opts }) };
}
test.afterEach(() => {
  for (const dir of scratches.splice(0)) {
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file));
      fs.rmdirSync(dir);
    }
  }
});

test('matching observed turn includes line and source hash', () => {
  const { report } = run([envelope('session_meta', meta()), envelope('turn_context', turn())]);
  assert.equal(report.status, 'MATCH');
  assert.equal(report.turns[0].status, 'MATCH');
  assert.equal(report.turns[0].source_line, 2);
  assert.match(report.source_sha256, /^[a-f0-9]{64}$/);
});

test('model and effort differences are mismatches', () => {
  const model = run([envelope('session_meta', meta()), envelope('turn_context', turn('t', { model: 'other' }))]);
  assert.equal(model.report.status, 'MISMATCH');
  const effort = run([envelope('session_meta', meta()), envelope('turn_context', turn('t', { effort: 'high' }))]);
  assert.equal(effort.report.turns[0].status, 'MISMATCH');
});

test('wrong identity, project, parent and role remain unverified', () => {
  for (const change of [
    { id: 'wrong' }, { cwd: os.tmpdir() }, { parent_thread_id: 'wrong' }, { agent_role: 'code_reviewer' },
  ]) {
    const { report } = run([envelope('session_meta', meta(change)), envelope('turn_context', turn())]);
    assert.equal(report.status, 'UNVERIFIED');
  }
});

test('legacy thread spawn identity binds the same child', () => {
  const legacy = { id: CHILD, cwd: PROJECT, source: { subagent: { thread_spawn: { parent_thread_id: PARENT, agent_type: ROLE } } } };
  const { report } = run([envelope('session_meta', legacy), envelope('turn_context', turn())]);
  assert.equal(report.status, 'MATCH');
});

test('conflicting identity metadata is unverified', () => {
  const conflicting = meta({ source: { subagent: { thread_spawn: { parent_thread_id: PARENT, agent_role: 'code_reviewer' } } } });
  const { report } = run([envelope('session_meta', conflicting), envelope('turn_context', turn())]);
  assert.equal(report.status, 'UNVERIFIED');
});

test('all turns are reported and a later match cannot hide mismatch', () => {
  const { report } = run([envelope('session_meta', meta()), envelope('turn_context', turn('first', { model: 'wrong' })), envelope('turn_context', turn('later'))]);
  assert.equal(report.status, 'MISMATCH');
  assert.deepEqual(report.turns.map(x => x.status), ['MISMATCH', 'MATCH']);
});

test('selected and missing turns are handled explicitly', () => {
  const ctx = setup();
  write(ctx.rollout, [envelope('session_meta', meta()), envelope('turn_context', turn('wanted')), envelope('turn_context', turn('other', { model: 'bad' }))]);
  assert.equal(readCodexRuntime({ ...ctx.options, turnId: 'wanted' }).status, 'MATCH');
  const missing = readCodexRuntime({ ...ctx.options, turnId: 'missing' });
  assert.equal(missing.status, 'UNVERIFIED');
  assert.equal(missing.turns[0].reason, 'requested turn was not found');
});

test('duplicate turn ids do not produce a match', () => {
  const { report } = run([envelope('session_meta', meta()), envelope('turn_context', turn()), envelope('turn_context', turn())]);
  assert.equal(report.status, 'UNVERIFIED');
  assert.ok(report.turns.every(x => x.status === 'UNVERIFIED'));
});

test('conflicting and selected duplicate turns all remain unverified', () => {
  const records = [envelope('session_meta', meta()), envelope('turn_context', turn('same')), envelope('turn_context', turn('same', { model: 'attacker', effort: 'high' }))];
  const all = run(records).report;
  assert.deepEqual(all.turns.map(x => x.status), ['UNVERIFIED', 'UNVERIFIED']);
  const selected = run(records, { turnId: 'same' }).report;
  assert.deepEqual(selected.turns.map(x => x.status), ['UNVERIFIED', 'UNVERIFIED']);
});

test('malformed JSON, partial tail, and no turns stay unverified', () => {
  for (const records of [
    [envelope('session_meta', meta()), '{bad'],
    [envelope('session_meta', meta()), envelope('turn_context', turn()) + '{partial'],
    [envelope('session_meta', meta())],
  ]) {
    const { report } = run(records);
    assert.equal(report.status, 'UNVERIFIED');
  }
  const { rollout, options } = setup();
  fs.writeFileSync(rollout, envelope('session_meta', meta()) + '\n' + envelope('turn_context', turn()), 'utf8');
  assert.equal(readCodexRuntime(options).status, 'MATCH');
});

test('missing string effort is unverified and effort objects are not guessed', () => {
  for (const effort of [undefined, { level: 'medium' }]) {
    const payload = turn();
    if (effort === undefined) delete payload.effort; else payload.effort = effort;
    const { report } = run([envelope('session_meta', meta()), envelope('turn_context', payload)]);
    assert.equal(report.status, 'UNVERIFIED');
  }
});

test('changed spawn-time config hash is unverified', () => {
  const { rollout, options, config } = setup();
  write(rollout, [envelope('session_meta', meta()), envelope('turn_context', turn())]);
  const { createHash } = require('node:crypto');
  const correct = createHash('sha256').update(fs.readFileSync(config)).digest('hex');
  const wrong = `${correct[0] === '0' ? '1' : '0'}${correct.slice(1)}`;
  const report = readCodexRuntime({ ...options, configSha256: wrong });
  assert.equal(report.status, 'UNVERIFIED');
  assert.equal(report.turns.length, 0);
});

test('multiline instruction text cannot spoof config header', () => {
  const { config } = setup();
  const original = fs.readFileSync(config, 'utf8');
  const spoofed = original.replace('Fixture instructions.', 'model = "attacker"\nmodel_reasoning_effort = "high"\nFixture instructions.');
  assert.notEqual(spoofed, original);
  assert.deepEqual(parseConfig(spoofed, ROLE), { model: 'gpt-6-luna', effort: 'medium' });
});

test('inline triple quotes inside instructions are rejected as ambiguous', () => {
  assert.throws(() => parseConfig(`name = "${ROLE}"\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "medium"\ndeveloper_instructions = """\nmodel = "attacker" """\n"""\n`, ROLE));
});

test('nested tables and unsupported multiline values are rejected', () => {
  assert.throws(() => parseConfig(`name = "${ROLE}"\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "medium"\n[agent]\nmodel = "attacker"\n`, ROLE));
  assert.throws(() => parseConfig(`name = "${ROLE}"\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "medium"\ndescription = """\nmodel = "attacker"\n"""\n`, ROLE));
});

test('unreadable rollout is sanitized', () => {
  const ctx = setup();
  ctx.options.rollout = path.join(scratch, 'missing.jsonl');
  const report = readCodexRuntime(ctx.options);
  assert.equal(report.status, 'UNVERIFIED');
  assert.doesNotMatch(JSON.stringify(report), /ENOENT|\\Users\\/i);
});

test('CLI help and usage errors do not expose supplied content', () => {
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  const bad = spawnSync(process.execPath, [SCRIPT, '--rollout', 'SENTINEL-PRIVATE-BODY'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.doesNotMatch(bad.stderr, /SENTINEL-PRIVATE-BODY/);
});

test('transcript bodies are never copied into report', () => {
  const ctx = setup();
  const secret = 'SENTINEL-PROMPT-AND-TOOL-OUTPUT';
  write(ctx.rollout, [envelope('session_meta', meta()), JSON.stringify({ type: 'response_item', payload: { text: secret } }), envelope('turn_context', turn())]);
  const report = readCodexRuntime(ctx.options);
  assert.equal(report.status, 'MATCH');
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
});

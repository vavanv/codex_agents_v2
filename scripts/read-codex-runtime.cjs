'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const MAX_BYTES = 64 * 1024 * 1024;
const FORMAT_VERSION = 1;
const EXPECTED_CONFIG_KEYS = ['name', 'model', 'model_reasoning_effort'];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readText(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('INPUT_TOO_LARGE');
  const bytes = fs.readFileSync(file);
  if (bytes.length > MAX_BYTES) throw new Error('INPUT_TOO_LARGE');
  return { bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}

function parseConfig(text, expectedRole) {
  const values = Object.create(null);
  let inInstructions = false;
  for (const line of text.split(/\r?\n/)) {
    if (inInstructions) {
      if (/^\s*"""\s*$/.test(line)) inInstructions = false;
      else if (/"""/.test(line)) throw new Error('UNSUPPORTED_CONFIG_STRUCTURE');
      continue;
    }
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (/^\s*developer_instructions\s*=\s*"""\s*$/.test(line)) { inInstructions = true; continue; }
    if (/^\s*\[/.test(line) || /'''|"""/.test(line)) throw new Error('UNSUPPORTED_CONFIG_STRUCTURE');
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*(?:#.*)?$/);
    if (!match) throw new Error('UNSUPPORTED_CONFIG_STRUCTURE');
    const [, key, raw] = match;
    const value = raw.match(/^"([^"\\]*)"$/);
    if (!value) throw new Error('UNSUPPORTED_CONFIG_VALUE');
    if (EXPECTED_CONFIG_KEYS.includes(key)) {
      if (Object.prototype.hasOwnProperty.call(values, key)) throw new Error('DUPLICATE_CONFIG_KEY');
      values[key] = value[1];
    }
  }
  if (inInstructions) throw new Error('UNTERMINATED_INSTRUCTIONS');
  if (values.name !== expectedRole || !values.model || !values.model_reasoning_effort) throw new Error('CONFIG_INCOMPLETE');
  return { model: values.model, effort: values.model_reasoning_effort };
}

function normalizePath(value) {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value)) return null;
  const normalized = path.resolve(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function identity(payload) {
  const roles = [];
  const parents = [];
  if (typeof payload.agent_role === 'string') roles.push(payload.agent_role);
  if (typeof payload.parent_thread_id === 'string') parents.push(payload.parent_thread_id);
  const spawn = payload.source && payload.source.subagent && payload.source.subagent.thread_spawn;
  if (spawn && typeof spawn === 'object') {
    if (typeof spawn.agent_role === 'string') roles.push(spawn.agent_role);
    if (typeof spawn.agent_type === 'string') roles.push(spawn.agent_type);
    if (typeof spawn.parent_thread_id === 'string') parents.push(spawn.parent_thread_id);
  }
  const uniqueRoles = [...new Set(roles)];
  const uniqueParents = [...new Set(parents)];
  return {
    id: typeof payload.id === 'string' ? payload.id : null,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : null,
    role: uniqueRoles.length === 1 ? uniqueRoles[0] : null,
    parent: uniqueParents.length === 1 ? uniqueParents[0] : null,
    conflict: uniqueRoles.length > 1 || uniqueParents.length > 1,
  };
}

function readCodexRuntime(options) {
  const report = {
    format_version: FORMAT_VERSION,
    status: 'UNVERIFIED',
    source_sha256: null,
    config_sha256: null,
    comparison_basis: options.configSha256 ? 'spawn-time hash supplied' : 'current config; spawn-time config not proven',
    turns: [],
    limitations: ['Persisted turn_context records are runtime evidence, not backend attestation or proof of completed model calls.'],
  };
  let runtimeBytes, runtimeText, configBytes, configText;
  try {
    ({ bytes: runtimeBytes, text: runtimeText } = readText(options.rollout));
    report.source_sha256 = sha256(runtimeBytes);
    ({ bytes: configBytes, text: configText } = readText(options.config));
    report.config_sha256 = sha256(configBytes);
  } catch (error) {
    report.reason = error && error.message === 'INPUT_TOO_LARGE' ? 'input exceeds size limit' : 'input unavailable or invalid UTF-8';
    return report;
  }

  const root = path.resolve(options.projectRoot);
  const relativeConfig = path.relative(root, path.resolve(options.config));
  if (!relativeConfig || relativeConfig.startsWith(`..${path.sep}`) || path.isAbsolute(relativeConfig)) {
    report.reason = 'config path must be inside project root'; return report;
  }
  if (options.configSha256 && (!/^[a-f0-9]{64}$/i.test(options.configSha256) || report.config_sha256 !== options.configSha256.toLowerCase())) {
    report.reason = 'current config hash differs from supplied spawn-time hash'; return report;
  }

  let configured;
  try { configured = parseConfig(configText, options.role); }
  catch (_) { report.reason = 'config header is incomplete, conflicting, or unsupported'; return report; }

  const records = [];
  let malformed = false;
  const lines = runtimeText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '');
    if (!raw) continue;
    let record;
    try { record = JSON.parse(raw); } catch (_) { malformed = true; continue; }
    if (!record || typeof record !== 'object' || Array.isArray(record)) { malformed = true; continue; }
    if (record.type === 'session_meta' || record.type === 'turn_context') {
      if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) { malformed = true; continue; }
      records.push({ line: i + 1, type: record.type, payload: record.payload });
    }
  }
  const metas = records.filter(r => r.type === 'session_meta');
  const turns = records.filter(r => r.type === 'turn_context');
  const firstRecord = records[0];
  const meta = metas.length === 1 && firstRecord === metas[0] ? identity(metas[0].payload) : null;
  const validIdentity = !!meta && !meta.conflict && meta.id === options.threadId && meta.parent === options.parentThreadId && meta.role === options.role && normalizePath(meta.cwd) === normalizePath(root);
  if (malformed || !validIdentity) {
    report.reason = malformed ? 'malformed or unsupported required JSONL evidence' : 'child session identity, parent, role, or project directory is missing or inconsistent';
  }

  let selected = turns;
  if (options.turnId) selected = turns.filter(r => r.payload.turn_id === options.turnId);
  const idCounts = new Map();
  for (const item of turns) {
    const id = typeof item.payload.turn_id === 'string' ? item.payload.turn_id : null;
    if (id) idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  for (const item of selected) {
    const p = item.payload;
    const id = typeof p.turn_id === 'string' ? p.turn_id : null;
    const duplicate = id && idCounts.get(id) > 1;
    let status = 'UNVERIFIED';
    let reason = 'identity or turn evidence is incomplete';
    const model = typeof p.model === 'string' ? p.model : null;
    const effort = typeof p.effort === 'string' ? p.effort : null;
    if (validIdentity && !malformed && id && (!options.turnId || id === options.turnId) && normalizePath(p.cwd) === normalizePath(root) && model && effort && !duplicate) {
      status = model !== configured.model || effort !== configured.effort ? 'MISMATCH' : 'MATCH';
      reason = status === 'MATCH' ? 'observed turn model and effort equal configured values' : 'observed turn model or effort differs from configured values';
    } else if (duplicate) reason = 'duplicate turn id';
    report.turns.push({ turn_id: id, source_line: item.line, runtime_model: model, runtime_effort: effort, status, reason });
  }
  if (options.turnId && selected.length === 0) report.turns.push({ turn_id: options.turnId, source_line: null, runtime_model: null, runtime_effort: null, status: 'UNVERIFIED', reason: 'requested turn was not found' });
  if (!options.turnId && turns.length === 0) report.turns.push({ turn_id: null, source_line: null, runtime_model: null, runtime_effort: null, status: 'UNVERIFIED', reason: 'no turn_context records found' });
  if (report.turns.some(t => t.status === 'MISMATCH')) report.status = 'MISMATCH';
  else if (report.turns.length && report.turns.every(t => t.status === 'MATCH') && validIdentity && !malformed) report.status = 'MATCH';
  report.role = options.role;
  report.thread_id = options.threadId;
  report.parent_thread_id = options.parentThreadId;
  report.project_root = root;
  if (!report.reason && report.status === 'UNVERIFIED') report.reason = 'one or more turns lack sufficient runtime evidence';
  if (options.turnId && report.turns.length > 1) report.reason = 'duplicate requested turn records';
  return report;
}

function parseArgs(argv) {
  const values = Object.create(null);
  const flags = new Set(['--help']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (flags.has(key)) { values.help = true; continue; }
    if (!['--rollout', '--config', '--project-root', '--thread-id', '--parent-thread-id', '--role', '--turn-id', '--config-sha256'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('USAGE');
    if (values[key]) throw new Error('USAGE');
    values[key] = argv[++i];
  }
  if (values.help) return { help: true };
  for (const key of ['--rollout', '--config', '--project-root', '--thread-id', '--parent-thread-id', '--role']) if (!values[key]) throw new Error('USAGE');
  return { rollout: values['--rollout'], config: values['--config'], projectRoot: values['--project-root'], threadId: values['--thread-id'], parentThreadId: values['--parent-thread-id'], role: values['--role'], turnId: values['--turn-id'], configSha256: values['--config-sha256'], help: values.help };
}

function main(argv) {
  let options;
  try { options = parseArgs(argv); }
  catch (_) { process.stderr.write('Usage error. Run with --help for required options.\n'); process.exitCode = 2; return; }
  if (options.help) {
    process.stdout.write('Usage: node scripts/read-codex-runtime.cjs --rollout FILE --config TOML --project-root DIR --thread-id UUID --parent-thread-id UUID --role NAME [--turn-id ID] [--config-sha256 HEX]\n');
    return;
  }
  process.stdout.write(`${JSON.stringify(readCodexRuntime(options), null, 2)}\n`);
}

module.exports = { readCodexRuntime, parseConfig };
if (require.main === module) main(process.argv.slice(2));

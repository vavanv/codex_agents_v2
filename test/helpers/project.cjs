'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const roots = [];
function tempDir(prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  roots.push(dir);
  return dir;
}
process.on('exit', () => { for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true }); });
function makeProject({ git = true } = {}) {
  const root = tempDir('codex-gate-project-');
  const home = tempDir('codex-gate-home-');
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/a.txt'), 'original\n');
  fs.writeFileSync(path.join(root, 'other.txt'), 'other\n');
  if (git) spawnSync('git', ['init', '-q'], { cwd: root });
  return { root, home };
}
function writeTranscript(project, role, { model, handback, text } = {}) {
  const file = path.join(project.home, `${role}-transcript.jsonl`);
  const content = [];
  if (text) content.push({ type: 'text', text });
  if (handback) content.push({ type: 'tool_use', name: 'SubagentHandback', input: { message: handback } });
  fs.writeFileSync(file, JSON.stringify({ type: 'assistant', effort: 'low', version: '2.1.317', message: { model, content } }) + '\n');
  return file;
}
module.exports = { tempDir, makeProject, writeTranscript };

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir } = require('./helpers/project.cjs');
const { parseVerdict } = require('../gate/lib/transcript.cjs');
const R = require('../gate/lib/run.cjs');

test('mixed test, reading and inspection entries retain all five criteria', () => {
  const coverage = ['inspection', 'test', 'reading', 'inspection', 'test'].map((by, i) => ({ criterion: i + 1, by, where: `evidence ${i + 1}` }));
  const review = parseVerdict(JSON.stringify({ verdict: 'APPROVE', findings: [], coverage }));
  assert.equal(review.verdict, 'APPROVE');
  assert.deepEqual(review.coverage, coverage.map(c => ({ ...c, by: c.by === 'inspection' ? 'reading' : c.by })));
});

test('inspection aliases do not satisfy required named-test coverage', () => {
  const dir = tempDir('codex-gate-coverage-');
  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify({ acceptance: ['Criterion'], requireTests: true }));
  for (const by of ['reading', 'inspection', 'test']) {
    const review = parseVerdict(JSON.stringify({ verdict: 'APPROVE', findings: [], coverage: [{ criterion: 1, by, where: 'named evidence' }] }));
    const run = { dir, state: { review } };
    assert.equal(R.coverageMissing(run), false);
    assert.equal(R.coverageRejected(run), by !== 'test');
  }
});

test('unknown coverage labels remain invalid rather than becoming tests', () => {
  const review = parseVerdict(JSON.stringify({ verdict: 'APPROVE', findings: [], coverage: [{ criterion: 1, by: 'unknown' }] }));
  assert.equal(review.coverage, null);
});

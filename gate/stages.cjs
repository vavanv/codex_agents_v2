'use strict';
const R = require('./lib/run.cjs');
const { parseVerdict } = require('./lib/transcript.cjs');

// Explicit orchestration adapter. Events are caller assertions, not hook evidence.
function stage(root, action, input) {
  const run = R.loadActive(root);
  if (!run || run.state.halt) throw new Error('No usable active run');
  const s = run.state;
  const { role, agentId } = input;
  if (!R.ROLES.includes(role) || typeof agentId !== 'string' || !agentId.trim()) throw new Error('Role and observed agentId required');
  if (action === 'start') {
    if (R.expectedRole(s) !== role) throw new Error('Stage is out of order');
    if (Object.values(s.agents).some(a => a.agentId === agentId)) throw new Error('Distinct agent identities required');
    if (role !== 'implementer' && !R.verify(run, `before-${role}`)) {
      R.saveState(run);
      throw new Error('Candidate changed');
    }
    s.stage = `${role}_running`;
    s.agents[role] = { agentId, startedAt: new Date().toISOString(), finished: false };
  } else if (action === 'finish') {
    const agent = s.agents[role];
    if (R.runningRole(s) !== role || !agent || agent.agentId !== agentId || agent.finished) throw new Error('No matching running stage');
    if (role === 'reviewer') {
      const verdict = parseVerdict(JSON.stringify(input.review));
      if (!verdict) throw new Error('Valid reviewer verdict required');
      s.review = verdict;
    }
    agent.finished = true;
    agent.finishedAt = new Date().toISOString();
    s.modelAudit[role] = { status: 'UNVERIFIED', configuredModel: s.roleConfigs[role].expectedModel, observedModels: [], observedEfforts: [], reason: 'Explicit stage event; no runtime model evidence' };
    if (input.runtime) {
      const names = { implementer: 'quick_implementer', validator: 'code_validator', reviewer: 'code_reviewer' };
      const evidence = require('../scripts/read-codex-runtime.cjs').readCodexRuntime({ ...input.runtime, projectRoot: root, role: names[role], threadId: agentId });
      s.modelAudit[role] = { ...s.modelAudit[role], status: evidence.status, observedModels: [...new Set(evidence.turns.map(t => t.runtime_model).filter(Boolean))], observedEfforts: [...new Set(evidence.turns.map(t => t.runtime_effort).filter(Boolean))], evidence };
    }
    if (role === 'implementer') {
      R.freeze(run);
      s.stage = 'validator_ready';
    } else if (role === 'validator') {
      if (R.spec(run).checks.some(c => !s.checks[c.id]) || (R.spec(run).mutation && !s.mutation)) R.halt(run, 'UNVERIFIED', 'Required validation evidence missing');
      R.verify(run, 'after-validation');
      s.stage = 'reviewer_ready';
    } else {
      R.verify(run, 'after-review');
      if (R.canRepair(run)) R.beginRepair(run);
      else {
        if (s.review.verdict !== 'APPROVE' || R.mutationRejected(s) || R.coverageRejected(run)) R.halt(run, 'FAILED', 'Review, coverage or mutation rejected candidate');
        else if (R.coverageMissing(run)) R.halt(run, 'UNVERIFIED', 'Criterion coverage missing');
        s.stage = 'report_ready';
      }
    }
  } else throw new Error('Expected start or finish');
  R.logEvent(run, `explicit_stage_${action}`, { role, agentId, provenance: 'caller-supplied' });
  R.saveState(run);
  return { stage: s.stage, halt: s.halt };
}
module.exports = { stage };

# Development workflow

Use the installed `gate/gate.cjs` by absolute path. Every command accepts
`--project <absolute-project>`. Root orchestrates three distinct real sessions,
one at a time. Do not run concurrent gate commands or manually edit files while
validation/review runs. These are instructions, not OS access controls.

1. Draft a JSON spec with `task`, observable `acceptance`, allowed path globs in
   `scope`, and actual `checks` (`id`, `kind`, `parser`, `command`, optional `cwd`
   and `timeoutSec`). Obtain approval of scope and executable commands. Require
   at least one test check. Parsers include `node-test`, `jest`, `pytest` and
   `unittest`; see `gate/lib/parsers.cjs` for the complete set. Set `maxRepairs: 0`
   to disable repair, or `1` for one repair after concrete review/mutation findings.
2. Pipe the spec to `init`. The gate runs baseline checks, validates the spec,
   snapshots the project and stops on setup failure. Use `failingBefore` only for
   explicitly expected baseline failures. Never infer successful initialization.
3. Spawn the implementer with scope, requirements and restrictions. Pipe
   `{"role":"implementer","agentId":"<actual observed identity>"}` to `start`
   before its work; pipe the same object to `finish` after completion. The gate
   checks scope, saves changes and freezes candidate hashes.
4. Spawn a distinct validator, record its `start`, and have it execute each
   `validate --check <id>` sequentially. If the spec requests `mutation`, run
   `validate --mutation`. Do not edit candidate files. Record `finish`; missing
   checks or changed hashes prevent a pass.
5. Spawn a distinct reviewer with requirements, candidate files and test evidence.
   Record `start`. Have it read the source and tests independently and return
   `{"verdict":"APPROVE","findings":[]}` or `REQUEST_CHANGES` with concrete
   findings. For criterion coverage, include `coverage` entries with `criterion`
   (one-based), `by` (`test` or `reading`) and `where`. `inspection` is accepted
   as an alias for `reading`; both mean code inspection, not an executed test.
   Pipe its observed
   output in the `review` property of the reviewer `finish` event.
6. Inspect `status`. If a repair is authorized by the spec, use fresh identities
   for all three stages; retain previous attempt evidence. Otherwise run `report`.
   Use `abort --reason <text>` to terminate an incomplete run and preserve evidence.

Use custom agent configurations only when supported by the actual client. When
only generic delegation is exposed, supply each role's instructions explicitly
and report configured model selection as unverified. Never invent tool arguments.
Optional runtime evidence on finish is described in the repository README.

Report the gate result, commands and exit codes, counts, findings, fingerprints,
evidence directory and integration limits. A caller-supplied event is not proof
of an authenticated lifecycle callback. The gate does not intercept Codex tools;
scope drift is detected at checkpoints. Model evidence is separate from check
and review outcomes. Check commands run with the caller's permissions.

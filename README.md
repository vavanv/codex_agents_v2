# Codex Agents v2

A development gate adapted from `C:\Develop\agents\claude_agents_mvp` (MIT,
copyright 2026 Vladimir V). The imported engine in `gate/` provides approved
spec validation, baseline checks, file inventories, frozen candidates, saved
changes, check logs and counts, optional mutation checks, one optional repair,
and JSON/Markdown reports. It uses Node built-ins and requires no packages.

The Codex adapter uses explicit stage events. The orchestrator supplies actual
agent identities and reviewer output. These are assertions, not independently
verified lifecycle events. **No Codex tool hooks are installed.** A report's
`PASS` means the recorded gate workflow passed; it does not prove agent isolation
or that caller-supplied identities and completions are authentic. Do not run
concurrent gate commands for the same project. Live Codex adoption remains unverified.

## Local development

Use Node.js 24 and Windows PowerShell 5.1 or 7. Run `npm test` for reader,
gate, installation, inventory, parser and mutation tests. No build is needed.
Prefix shell commands with RTK when required by your session instructions.

## Install into a project

Install separately in each project that should use the gate. Each target directory
must already exist and be outside this source repository. Node.js 24 must be on
`PATH`. Run the following in PowerShell from any directory; replace the paths
with your source checkout and target project:

```powershell
$sourceRepo = 'C:\Develop\agents\codex_agents_v2'
$project = 'C:\Develop\my-app'

# Preview the files, then install after reviewing the output.
& "$sourceRepo\install.ps1" -ProjectRoot $project -WhatIf
& "$sourceRepo\install.ps1" -ProjectRoot $project
```

Installation creates `<project>/.codex/dev-gate/` containing the runner,
instructions, role templates, runtime reader and ownership manifest. Existing
root `AGENTS.md`, Codex configuration and agent files are preserved. Installation
does not start Codex, activate custom agents, run project checks or install packages.

Open Codex in the target project and instruct it to read
`.codex/dev-gate/templates/development/AGENTS.md` and the adjacent
`workflows/develop.md` before using the gate. Its runner is
`.codex/dev-gate/gate/gate.cjs`. See "Run a change" below for stage commands.

### Install into additional projects

Use the same source checkout and change only `-ProjectRoot`. For example, a client
and API in separate repositories each receive their own installation:

```powershell
& "$sourceRepo\install.ps1" -ProjectRoot 'C:\Develop\my-app-client' -WhatIf
& "$sourceRepo\install.ps1" -ProjectRoot 'C:\Develop\my-app-client'

& "$sourceRepo\install.ps1" -ProjectRoot 'C:\Develop\my-app-api' -WhatIf
& "$sourceRepo\install.ps1" -ProjectRoot 'C:\Develop\my-app-api'
```

Project installations are independent copies. Editing this source checkout does
not update them. An existing `.codex/dev-gate/` directory stops installation;
there is no in-place upgrade command. To refresh an unchanged installation,
uninstall it first, then install again. Preserve and reconcile local edits first.

## Uninstall from a project

Use the source checkout's uninstaller and name the project to remove it from:

```powershell
$sourceRepo = 'C:\Develop\agents\codex_agents_v2'
$project = 'C:\Develop\my-app'

& "$sourceRepo\uninstall.ps1" -ProjectRoot $project -WhatIf
& "$sourceRepo\uninstall.ps1" -ProjectRoot $project
```

Repeat with another `-ProjectRoot` to remove another installation. Removing the
client's installation does not remove the API's installation. The uninstaller
checks the ownership manifest and all managed file hashes before deleting files;
changed or missing managed files stop removal. Preserve your changes and reconcile
them before retrying; do not edit manifest hashes to force removal.

Existing project instructions, configuration and unmanaged files are preserved.
Empty installation directories are removed. Run evidence under
`~/.codex/dev-gate/runs/` (or `CODEX_GATE_HOME`) is retained. An interrupted install
without a manifest requires manual reconciliation.

### Node.js alternative

These commands perform the same operations without the PowerShell wrappers:

```powershell
$manager = 'C:\Develop\agents\codex_agents_v2\scripts\manage-install.cjs'
$project = 'C:\Develop\my-app'

node $manager install $project --what-if
node $manager install $project
node $manager uninstall $project --what-if
node $manager uninstall $project
```

## Use it after installation

### 1. Open the target project in Codex

Open the project where you installed the gate, for example `C:\Develop\my-app`.
Start with this prompt, replacing the task and paths with your own:

```text
Use the installed development gate for this task: fix the lower-bound bug in clamp.
Read .codex/dev-gate/templates/development/AGENTS.md and
.codex/dev-gate/templates/development/workflows/develop.md first.
Inspect this project's source and existing test commands. Propose acceptance
criteria, allowed edit paths and exact checks for my approval before starting.
After approval, use three distinct real agent sessions sequentially for
implementation, validation and review. Record observed identities through the
installed gate's start/finish commands. Run checks through the gate, then show
the report, evidence directory, findings and any unverified integration details.
If real delegation is unavailable, stop and report that limitation.
```

The installed instructions are not automatically activated. Include the instruction
to read them when starting a new task. Installing alone does not create a slash
command. Codex handles the stage commands below as the orchestrator; you review
the proposed scope/checks and the resulting changes.

### 2. Review the task spec

Codex should prepare a JSON spec before implementation. For example, for a project
that already uses Node's test runner:

```json
{
  "task": "Fix clamp's lower-bound handling",
  "acceptance": ["Values below the lower bound return the lower bound"],
  "scope": ["src/clamp.js", "test/clamp.test.cjs"],
  "maxRepairs": 0,
  "requireTests": true,
  "checks": [
    {
      "id": "unit",
      "kind": "test",
      "parser": "node-test",
      "command": "node --test test/clamp.test.cjs",
      "timeoutSec": 120
    }
  ]
}
```

Use the project's actual paths and commands. For Jest, use its existing command
and the `jest` parser; do not copy the Node example unchanged. Checks run once
before implementation and again during validation. Save the approved spec before
initialization and leave it unchanged during the run. Build outputs, if needed,
must be declared up front with `declaredArtifacts`; source and tests stay covered.

### 3. Execute the workflow

Read [the workflow](templates/development/workflows/develop.md). Review and adapt
`examples/spec.json` to the target project's actual checks and approved scope.
That example is in the source checkout; it is not copied by the installer.
Use the installed runner's absolute path. These PowerShell commands illustrate
the orchestration after saving the approved spec as `spec.json` in the project:

```powershell
$project = 'C:\Develop\my-app'
$gate = Join-Path $project '.codex/dev-gate/gate/gate.cjs'
Get-Content -Raw (Join-Path $project 'spec.json') | node $gate init --project $project
node $gate status --project $project
```

After successful initialization, use the identity returned by each real agent
spawn. The following placeholders must be replaced; executing these commands does
not spawn agents or perform their work:

```powershell
# Record before the implementer begins editing.
'{"role":"implementer","agentId":"<actual-implementer-id>"}' | node $gate start --project $project
# Wait for the real implementer to complete, then freeze its candidate.
'{"role":"implementer","agentId":"<actual-implementer-id>"}' | node $gate finish --project $project

# Record the distinct validator; it runs every check from the approved spec.
'{"role":"validator","agentId":"<actual-validator-id>"}' | node $gate start --project $project
node $gate validate --check unit --project $project
'{"role":"validator","agentId":"<actual-validator-id>"}' | node $gate finish --project $project

# Start the distinct reviewer after validation succeeds.
'{"role":"reviewer","agentId":"<actual-reviewer-id>"}' | node $gate start --project $project
```

Record `start` and `finish` events around each actual implementer, validator,
and reviewer session, in that order. The validator uses
`node <gate> validate --check <id> --project <project>` for each approved check
and `validate --mutation` if requested. Checks run with your permissions;
approve only commands safe to execute and repeat. Mutation tests run in a copy;
dependency folders may be linked, so tests must not modify dependencies or services.

Reviewer completion includes structured output:

```json
{"role":"reviewer","agentId":"<observed-id>","review":{"verdict":"APPROVE","findings":[],"coverage":[{"criterion":1,"by":"test","where":"test/file.test.cjs: named case"}]}}
```

Coverage `by` is `test` for a named executed test or `reading` for code inspection.
The parser also accepts `inspection` and stores it as `reading`. Inspection entries
appear in the report but do not satisfy `requireTests: true`. Without that option,
an approved review may pass with inspection-only criteria, with a report note.
Existing installations need to be refreshed to receive parser fixes; see the
uninstall/reinstall procedure above. Previously saved reports are not rewritten.

Pipe that JSON to `finish`. Use `status` to inspect progress, `report` to close
a finished or halted run, or `abort --reason "explanation"` to stop and recover.
Use the actual reviewer's identity, verdict and findings. An approval in this
example must never substitute for a real review. For example, save its completion
object as `review-event.json` **outside the target project** to avoid changing the
frozen candidate, then pipe it to the runner:

```powershell
Get-Content -Raw 'C:\Temp\review-event.json' | node $gate finish --project $project
node $gate report --project $project
```

### 4. Inspect the result or stop a run

Evidence is under `~/.codex/dev-gate/runs/`; `CODEX_GATE_HOME` overrides that location.
The report prints its evidence directory. Open `report.md` or `report.json` there
to inspect changed files, check exits/counts, candidate comparisons and review.

| Result | What to do |
| --- | --- |
| `PASS` | Review the diff and evidence before accepting the change. |
| `FAILED` | Inspect the failed check, review finding or scope/hash mismatch. |
| `UNVERIFIED` | Resolve the missing evidence or execution limitation before relying on the result. |
| `SETUP_REQUIRED` | Correct the spec, unavailable command or unexpected baseline failure before starting another run. |

If a run stalls, inspect or stop it from PowerShell:

```powershell
node $gate status --project $project
node $gate abort --reason 'Stopping this task to revise its scope' --project $project
```

Abort preserves evidence and leaves working-tree edits in place. Review those
edits before starting a new task. Run one task at a time per project, and keep
the same `CODEX_GATE_HOME` setting for all commands in a run.

## Runtime model evidence

`scripts/read-codex-runtime.cjs --help` documents the read-only rollout reader.
It reports `MATCH`, `MISMATCH`, or `UNVERIFIED` without copying transcript bodies.
An optional `runtime` object on a finish event accepts its options (`rollout`,
`config`, `parentThreadId`, `turnId`, `configSha256`). Project, thread and role are
bound by the adapter. Missing evidence remains unverified and is separate from
the workflow result. Local rollout metadata is evidence, not backend attestation.

## Remaining integration work

Codex lifecycle/tool hook registration, automatic authenticated stage events,
and a supervised live run have not been implemented or demonstrated. Current
Codex clients differ in their agent-selection tools; inspect the actual schema
and never invent an `agent_type` parameter. Custom TOML templates follow the
[documented standalone agent format](https://learn.chatgpt.com/docs/agent-configuration/subagents).

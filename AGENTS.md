# Repository Guidelines

## Project Structure & Module Organization

This repository is a work-in-progress copy of the Codex Agents MVP. `install.ps1` and `uninstall.ps1` manage project-local installations. `templates/development/` contains the installed agent instructions, role configuration, and workflow. `scripts/read-codex-runtime.cjs` inspects saved runtime evidence; its Node.js tests are in `test/`. See `README.md` for current limitations and installation details.

## Development & Test Commands

- `node --test test/read-codex-runtime.test.cjs` runs the runtime reader tests using Node's built-in test runner.
- `node scripts/read-codex-runtime.cjs --help` displays the reader's required arguments.
- `./install.ps1 -ProjectRoot <existing-project> -WhatIf` previews installation; use `-MvpRoot` if needed to select this repository.
- `./uninstall.ps1 -ProjectRoot <existing-project> -WhatIf` previews removal. Review the output before running either script without `-WhatIf`.

Run PowerShell scripts in Windows PowerShell 5.1 or PowerShell 7. There is no build step or dependency installation documented for the runtime reader.

## Coding Style & Naming

Follow the surrounding file: PowerShell uses four-space indentation and verb-noun function names; CommonJS JavaScript uses two-space indentation, single quotes, and semicolons. Keep scripts compatible with their existing runtimes and use Node built-ins where practical. Name runtime reader tests `*.test.cjs` and describe the behavior in each test name. No repository-wide formatter or linter is configured.

## Testing Guidelines

Add focused `node:test` cases for reader behavior, including malformed input and sanitized output when relevant. Run the test command above after changing the reader. For installer changes, exercise preview and installation/removal against a disposable project and verify backup and manifest behavior. No coverage threshold is documented.

## Changes & Reviews

Git history is unavailable in this checkout, so no existing commit convention can be established. Use concise, imperative commit subjects and describe the purpose and validation in pull requests. Note installer effects, compatibility changes, and any limitations reviewers should reproduce.

## Safety & Configuration

Keep runtime evidence read-only and avoid exposing prompts, credentials, or transcript bodies. Preserve installer conflict checks, backups, and ownership hashes; never alter manifest hashes to force an uninstall. The copied workflow is instruction-driven and does not provide automatic stage enforcement.

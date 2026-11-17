# Development gate instructions

For a requested development change, read `workflows/develop.md` beside this file.
Use three distinct real agent sessions sequentially: implementer, validator,
reviewer. Use the actual collaboration tool schema. Role labels and loaded
custom configurations are separate facts; never claim a configuration was loaded
merely because a task was named after it. If agents are unavailable, report
UNVERIFIED rather than simulating their work.

Execute checks through the installed gate. Record observed identities in explicit
start/finish events. These events are caller assertions; they do not establish
tool interception or OS isolation. Never fabricate runtime evidence, passing
checks, review output or lifecycle events.

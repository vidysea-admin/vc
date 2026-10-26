# Brief — author qa/contracts/vc-admin-control.md (checker contract maintenance, Mode: contract authoring)
You are /checker maintaining contracts. Read C:/Users/Lenovo/.claude/skills/checker/SKILL.md (contract authoring / init-contract part) and the
existing contract qa/contracts/partner-chatbot.md for house format.
Inputs: docs/features/vc-admin-control/{intent,spec,plan}.md, qa/gates/vc-admin-control.md, qa/evidence/vc-admin-20261026/fact-F{1,2,3}.md.
Write qa/contracts/vc-admin-control.md: numbered criteria [VA1]..[VAn] (aim 14-20), each (serves: intent#<outcome n>), each with a runnable,
re-runnable verify (a test file + assertion intent, or a command) and a criticality. Must cover: secrets never in committed files/responses/logs
(git grep check + route test), AES-GCM round trip + tamper rejection, admin login + JWT typ check + rate limit, role matrix (viewer 403 on writes),
audit row per write, partner key reuse (no second key system), config schema rejects secret values, migrations parser, routes parser, Pathlynks
student scoping + fail-closed on write privilege + timeout/row cap, navigate_steps only known routes, capability manifest match, crisis-first unchanged,
turn_usage has no message text, metrics aggregation numbers, widget floater drag/resize/pop-out/toggle/shared history + existing modes intact,
admin UI browser walk for 3 roles. Mark live-Pathlynks/live-GitHub criteria as HELD on gates G1/G2 (fake-backed criteria are buildable now).
Commit only that file: git -C D:/vc add qa/contracts/vc-admin-control.md && git -C D:/vc commit -m "qa: contract vc-admin-control" -- qa/contracts/vc-admin-control.md
Return one line: `contract vc-admin-control <sha> <n> criteria`.

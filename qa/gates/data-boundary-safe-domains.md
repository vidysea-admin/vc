# Gate: data-boundary-safe-domains
**Opened:** 2026-09-28T01:37:24+05:30 (maker)
**Status:** awaiting Umesh. **Loosens a data-boundary gate — your word, not a maker's or a
checker's edit.** `qa/adapter.json` is a declaration file and neither session has touched it.

## The ask

Add `data_boundary_safe_domains` to `qa/adapter.json` naming `vidysea.com`,
`cloud.langfuse.com` and `eu.cloud.langfuse.com`, so the data-boundary check stops counting
them toward the email signal.

## What is actually in the flagged files — all of it, enumerated

`python data_boundary.py D:/vc` exits 1 on **39 files**. Reproduced on two independent
instruments in two sessions: a re-implementation of the check's own filters reading disk directly,
and the script's own run. 12 root-tree files + 27 across four worktrees. **Exactly three distinct
values:**

| value | files | what it is |
|---|---|---|
| `umeshsugara@vidysea.com` | 26 | your own address, in approver and attribution text |
| `himanshu@vidysea.com` | 18 | a team member's own address, same |
| `pass@eu.cloud.langfuse.com` | 28 | **not an address at all** — a `user:pass@host` basic-auth placeholder inside the *name of a security test* asserting that such a URL is refused by `initTracing` |

**No student data. No personal data of any third party.** The check is doing its job; what it
found is us.

## Why this is now necessary rather than tidy-up

**The count grows monotonically by construction.** The breaching set includes `qa/issues.jsonl`,
`qa/QUEUE.md`, `docs/DECISIONS.md` and **all four** files in `qa/sweeps/` — verified. So every
sweep written and every ledger append carrying an attribution line raises it. It moved 38 → 39
tonight purely because the maker-checker pair kept working.

Three consequences, and the third is the one that matters:
1. The check **can never return to exit 0** on its own.
2. Every recorded figure for it is stale within hours.
3. **A future re-run will not reproduce today's number, and the mismatch will read as a
   regression rather than as normal growth** — so the check trains its readers to discount it,
   which is how a real breach gets waved through.

## Why the mechanism is safe

`data_boundary.py:112-121` documents `data_boundary_safe_domains` as existing for exactly this
case, and it is **structurally guarded, not a free-text exemption**: an entry must be a plain
lowercase domain with at least one dot, no wildcard, no `@`, and must not be a public mailbox
provider (explicit denylist: gmail, outlook, yahoo, …) or a bare public suffix. An invalid entry
is a blocking violation, never silently dropped. So the list **cannot be used to launder a real
personal address.**

`vidysea.com` qualifies. `cloud.langfuse.com` / `eu.cloud.langfuse.com` are not mailbox domains
at all. `qa/adapter.json` uses neither this key nor `data_boundary_exclude` today — verified,
0 occurrences.

**Precedent, not authorization:** the same comment block records "ISS-016 residual triage
(2026-09-26, approved by Umesh)" — you approved this mechanism for this purpose in another
project. That is why the option is shaped this way; it is **not** a reason to skip asking, since
this is a different project's declaration.

## What this does NOT fix, and should not be sold as fixing

A raw no-suffix scan finds **57 files and 6 values**. The extra 18 files and 3 values are
**structurally invisible** to the check: `.ts` is absent from `TEXT_SUFFIXES` and `qa/.last-tick`
has no suffix at all. Hidden that way: `approver@synthetic.test` in `packages/db/src/testing.ts`
(and `synthetic.test` is **not** in `PLACEHOLDER_DOMAINS`, so it would count if `.ts` were
scanned), plus `pass@cloud.langfuse.com` and `token@cloud.langfuse.com` under
`packages/observability/tests/`. All synthetic; none is personal data; **none is a new breach.**

The point is the instrument: the suffix list is drawn around data formats and prose and omits
source files. The script's own comment at lines 39-45 records that the last time this list was
drawn around the previous incident's shape (`.md` missing), **two real Gmail addresses went
through the gate into a commit.** That is a finding against the shared skill, filed there by the
peer session, not against this project — and it means approving the option below leaves a real gap
open. Say so out loud rather than treating exit 0 as "clean".

## Options

- **(a) Approve the three safe domains.** The check returns to exit 0 and becomes a live signal
  again. **Recommended.** Cost: it is a loosening, and the `.ts` blind spot above stays open
  regardless — approving this must not be read as "the data boundary is clean".
- **(b) Approve `vidysea.com` only**, and leave the Langfuse placeholder breaching. Keeps the
  loosening minimal, but the check still never reaches exit 0, so consequence 3 above survives
  in full. Hard to recommend: it pays the cost of a decision and keeps the defect.
- **(c) Change nothing.** The check keeps exiting 1 on a number that climbs every hour. Honest,
  and it keeps every figure in the ledger drifting.

**Answer format:** chat reply. The maker appends `Answered:` here, then a DECISIONS entry, then
edits `qa/adapter.json` — not before.

## Provenance

Re-derivation and the monotonic-growth finding: peer session (vc-f5), `0d363b8` / `3124393`.
Adapter-key absence, the safe-domain guard contract, `TEXT_SUFFIXES`, and the growth claim
(all four `qa/sweeps/` files plus the ledger, queue and DECISIONS breach) re-verified here before
this gate was written. Rows: ISS-104, ISS-109, ISS-016.
Answered: 2026-10-25T06:48:16+05:30 — add vidysea.com, cloud.langfuse.com, eu.cloud.langfuse.com to qa/adapter.json data_boundary_safe_domains — Umesh chat 2026-10-25 "go with the recomemended ones"

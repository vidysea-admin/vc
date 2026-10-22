# Review result: pc-reserved-ids-2 cycle 0 (senior-software-engineer, read-only)
Verdict: Approve. partners.test 63/63; direct probes of isReservedPartnerId / partnerOwnTenantsFromEnv found no exemption path to another tenant; all key routes pass ownTenants; logs echo no values; docs match the code.
- low: apps/api/src/index.ts:551 sandbox-tenant exemption guard is case-sensitive; a mixed-case sandbox id lets a lowercase binding exempt partner `sandbox-x` (not exploitable: chat.ts:866 / voice.ts:1721 compare the sandbox tenant exactly). Fix: fold-compare.
- open: CLI does not know a custom sandbox tenant id (fails closed at request time; runbook `partner list` step covers it).
- test gaps: mixed-case sandbox vs lowercase binding; pathlynks-2 unaffected by a pathlynks listing/binding.
REVIEW pc-reserved-ids-2-c0 Approve

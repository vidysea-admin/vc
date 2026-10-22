# Go-live runbook: engineering alerts

Source: D-108 item 7. These alerts use the same mechanism as the T-021 failover alert (`provider_failover_exhausted`): one structured JSON line on
stderr (`{"level":"error","event":"alert_...", ...}`) plus a Langfuse error trace named `vc.<event>` (attribute `alert.event`). There is no email,
Slack or webhook transport. Alert lines carry names and figures only: never a student's words, a key or a transcript.

Watch stderr (or Langfuse error traces) for `"event":"alert_`.

| Event | Fires when | Rate limit | Attributes | First action |
|---|---|---|---|---|
| `alert_safety_screen_outage` | The authenticated chat safety screen failed (provider down, timeout, or invalid output). Every affected student turn is answered with the fixed crisis message (fail closed), no flag is logged and no escalation is sent for an outage. Also logged as `chat_write_failed` with `write="safety_screen"`. | At most once per 5 minutes per process (`SAFETY_SCREEN_ALERT_INTERVAL_MS`). A long outage re-alerts every 5 minutes. | `write` | Students are being shown the crisis message for ordinary questions, so treat as urgent. Check the concern-classifier provider (`VC_LLM_*`) status and credentials, then the `chat_write_failed` lines for the error name. If it cannot be fixed quickly, the interim clinical owner (D-108) decides whether to pause the chat route (`VC_CHAT_ENABLED` off). |
| `alert_chain_cap_80pct` | Spend on the text chain (reservations settled to reported usage) reached 80% of `VC_CHAIN_MONTHLY_CAP_USD` this UTC month. | Once per UTC month per process. | `month`, `capUsd`, `spentUsd` | Warning only; students are unaffected. Check whether the pace is expected (traffic, a runaway client). Decide before the cap whether to raise `VC_CHAIN_MONTHLY_CAP_USD` (a restart is needed; the counter is in-process and restarts from zero). |
| `alert_chain_cap_exhausted` | A chain request was refused because it would pass the monthly cap. Students now get the usual degraded "try again" reply until the month rolls over. Also logged as `chain_cap_exhausted`. | Once per UTC month per process. | `month`, `capUsd`, `spentUsd` | Students are degraded. Decide: raise the cap and restart (the counter restarts from zero, so after a restart spend is under-counted for the month), or accept degraded service until 00:00 UTC on the 1st. |

Existing alert for reference: `provider_failover_exhausted` (every model in the chain failed). First action: check the provider status and
`OLLAMA_API_KEY`.

## Before deploy: partner ids against tenants (pc-reserved-ids)

A partner id is the tenant id of everything its server key reaches, so a partner id equal to a real student-JWT tenant would let that partner read those students.

1. Set `VC_RESERVED_TENANT_IDS` to every `tenant` your student JWTs carry (and the sandbox tenant). **Empty means built-ins only**: `sandbox`, `admin`, `system`, `root`, `default`, `internal` (alone or followed by a separator and suffix) and this repo's demo and evaluation tenants. With the list empty the server logs `reserved_tenant_ids_empty` at startup and `partner add`/`partner list` print the same warning to stderr: treat it as a deploy blocker.
2. Run `pnpm -C apps/api partner list --check` first, with the same `VC_RESERVED_TENANT_IDS` and `VC_PARTNER_OWN_TENANTS` the server will use. It marks every partner whose id is now reserved (`** RESERVED: ... **`, with the reason) and exits 1 when any active partner is flagged, so a non-zero exit blocks the deploy; it prints ids and reasons only, never a key. It cannot know a custom sandbox tenant id (that is a code option of `startApi`, not an environment variable), so list the sandbox tenant in `VC_RESERVED_TENANT_IDS` as well. Any existing partner whose id equals a listed tenant (for example `pathlynks` when `pathlynks` is also a JWT tenant) is refused on every request after the deploy. If that partner really is meant to serve its own tenant, bind it explicitly: `VC_PARTNER_OWN_TENANTS=pathlynks:pathlynks`. Otherwise revoke it and add it under another id.
3. `partner rotate` on a partner whose id is reserved refuses (no key is minted); `partner revoke` always works.
4. Both variables are read only when `VC_PARTNER_KEY_PEPPER` is set; with the pepper unset startup logs `reserved_tenant_ids_ignored` and does not parse them.

Notes
- All limits are per process. With more than one replica each process alerts and counts on its own.
- A sink that throws is swallowed; an alert can never fail a student turn or hide a refusal.
- Never paste a key into a ticket or a chat when escalating; alert lines do not contain one.

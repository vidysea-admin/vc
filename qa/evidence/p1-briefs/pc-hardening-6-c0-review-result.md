# pc-hardening-6 c0 senior review result (read-only, diff ab15b2b..84313c9)
VERDICT: Approve. No finding above low.
- nginx: limit_req_log_level warn in both voice stream locations (nginx-vc.conf:87, :106) keeps 429 refusals (which carry the request line) out of the error log while the server error_log stays at the default level error; the conf sets no error_log; the doc warns not to lower it. Other limit_req locations unchanged.
- logrotate stanza valid, path matches the conf access_log; doc says to adjust owner/group and gives `logrotate -d`.
- Doc claims match code: ownerOverrideProblem :166 uses trim like b13Signed :123; exact signer compare :124, :170; B13 required for all four targets.
- Tests only add assertions (H1, H2, H3).
- low: H3 regex accepts info/notice as well as warn (all below error, harmless).
- low: only an operator lowering error_log to warn or below brings the request line back; settle with `nginx -T` on the host.

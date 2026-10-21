# Gate: text-only go-live launch inputs
Opened: 2026-10-21 (from deploy/KB investigation, agent a33c3ba60942216b2)
Blocks: launcher unit (apps/api/src/main.ts + start script + KB/speakers wiring)

Q1 New file: may the maker create apps/api/src/main.ts (launcher, ~60-150 lines incl. KB adapter)? Default: yes.
Q2 Student UI: no student page exists in the repo. Who serves the page that calls POST /v1/public/chat/turns? Options: (a) maker builds a minimal page in apps/web (~150 lines) (b) another team/site calls the API. Default: b if a site exists, else a.
Q3 Topology: is the Node process behind nginx/LB (clientKey from X-Forwarded-For) or exposed directly (trustSocketAddress)? Default: behind proxy, X-Forwarded-For.
Q4 KB keys (G-KB Q2): VC_KB_BASE_URL, VC_KB_API_KEY, VC_KB_ANON_API_KEY put in .env by ops. Without them every answer is no_sourced_answer.
Q5 Production speakers.json (names + permissions). Default: empty list (nobody quoted).
Q6 Records for the gate: B13-signed line (human only, D-103) and g-publish answer (recommended b).
Q7 Hosting: which server/domain runs it, who owns TLS.

Answer format: Q1 yes · Q2 a|b · Q3 proxy|direct · ... appended as `Answered: <ISO> - <answers> - <where>`.

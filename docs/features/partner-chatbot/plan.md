# Plan — partner-chatbot (2026-10-22)

| Unit | Owns (files) | After | Tier / check | Persona walk |
|---|---|---|---|---|
| pc-partner-keys | apps/api/src/{partners.ts(new),server.ts,index.ts,main.ts,anonymous.ts,chat.ts,auth.ts}, apps/api/scripts/partner.ts(new), apps/api/package.json script, infra/ubuntu/nginx-vc.conf, apps/api/tests/partners*.test.ts | — | L, dual (auth, apps/api/src/auth.ts) | skip (api) |
| pc-widget | apps/widget/** (new) | — | M, one checker + live browser | required (visitor, Pathlynks student) |
| pc-voice | apps/api/src/{voice.ts,go-live-gate.ts}, apps/widget/src/voice.js | pc-partner-keys, pc-widget | L, dual (auth/crisis) | required (visitor) |
| pc-docs-openapi | apps/api/src/openapi.ts, docs/partner-integration.md | pc-partner-keys | M, one checker | skip (docs/api) |

Wave 1: pc-partner-keys + pc-widget in parallel (disjoint files). Wave 2: pc-voice + pc-docs-openapi in parallel (disjoint: voice.ts/go-live-gate.ts/widget voice.js vs openapi.ts/docs).
Tests per unit: the new test files plus touched api tests run targeted (anonymous-route `--test-name-pattern`), never a full suite. Production deploy stays a separate Umesh gate (domain/TLS, keys).

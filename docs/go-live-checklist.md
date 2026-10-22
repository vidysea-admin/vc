# Go-live checklist (P1 student surface)

Short list for whoever flips the switches. Gate G-PROD is answered option (c), all three including voice (D-101,
2026-10-19), but the prerequisites below are still open. Nothing here is done by the build; each item is a human record.
Check the current state at any time with `pnpm -C apps/api exec tsx scripts/go-live-gate.ts <student-routes|anonymous|voice|publish>`
(read-only; exit 0 = allowed, 1 = refused with the missing records named).

## 1. Environment variables (deploy config)

| Variable | Rule |
|---|---|
| `VC_CHAT_ENABLED` | Exactly the word `true` to serve the authenticated student chat routes. Unset, empty or `false` = off. |
| `VC_VOICE_ENABLED` | Exactly the word `true` to serve the voice WebSocket. Unset, empty or `false` = off. |
| `VC_VOICE_WS_SECRET`, `VC_VOICE_WS_BASE_URL` | Required when voice is on (WebSocket token secret and the public `wss://` base URL). |
| `VC_ANONYMOUS_ENABLED` | `true` to serve the public anonymous route. Unlike the two above it is trimmed, but write it exactly anyway. |
| `VC_RESERVED_TENANT_IDS` | Partner keys only (needs `VC_PARTNER_KEY_PEPPER`). Comma- or space-separated: list **every `tenant` value your student JWTs carry** (each Vidysea and Pathlynks tenant id) and the sandbox tenant. A partner id equal to a listed id is refused at `partner add` and on every request. **Empty or unset = only the built-in names (`sandbox`, `admin`, ...) and this repo's own demo and evaluation tenants are protected**; the real JWT tenants are then unprotected, and the server and `partner add`/`partner list` print a warning saying so. A malformed list stops startup when partners are on. Run `pnpm -C apps/api partner list --check` before deploy (it marks and fails on a flagged partner): any existing partner whose id is, or looks like, a listed tenant will start getting `401`. |
| `VC_PARTNER_OWN_TENANTS` | Optional, with the list above. `<partner>:<tenant>` pairs (both halves the same id, e.g. `pathlynks:pathlynks`) for a partner whose own id is also a real JWT tenant: that exact partner is not blocked by the list, because a partner key reaches only the tenant named by its own id. Any other partner on that tenant stays refused. It can never free `sandbox`, `admin`, ... or the repo's tenants, nor the sandbox tenant. |
| `VC_GATE_APPROVER` | The repo Approver's name (the go-live gate and the CLI read it). Must be set for the D-111 voice override to apply: with it unset or empty an `Owner-override:` line in `a10-voice-gate.md` is refused and voice stays closed; set, the override signer must equal it exactly (it also pins the B13 signer). |

Padding fails startup, on purpose (ISS-263): `"true "`, `" true"`, `"TRUE"` and `"1"` are not `true`, and the server
refuses to start with a `ChatConfigError` / `VoiceConfigError` rather than silently turning a flag on or off
(`apps/api/src/chat.ts` `CHAT_FLAG_ENV`, `apps/api/src/voice.ts` `voiceEnabledFromEnv`). Check the deploy config for stray
spaces or quotes. A flag set to `true` also needs its ports (knowledge base, speakers file, Live provider, crisis message)
or startup fails, and each flag additionally passes the A20 go-live gate below.

## 2. G-PROD (c) prerequisites (`qa/gates/g-prod.md`)

All of these must be on disk in `qa/gates/` before the go-live script enables anything:

- [ ] B13 signed: a `B13-signed: SIGNED <ISO instant> by <Approver name>` line in `p1-u0-amendment-signatures.md`
      (minors' text and voice to Gemini and the KB's LLM provider, processor register filled in). Today: PENDING.
- [ ] A10 voice report passing: `a10-voice-gate.md` with `Result: PASS`, `Run-at: <ISO>` and an `Evidence:` path to a
      `qa/evidence/` report (real Gemini Live, synthetic audio, 20-phrase crisis set, 2 s bound). Voice only.
- [ ] `g-publish.md` answered (`Answered: <ISO> - <a|b>`). Today: unanswered.
- [ ] Nights mode recorded in `nights.md`: `Nights-mode: funded` or `tele-manas-disclosed`. Today: interim
      `tele-manas-disclosed`; the CEO's answer is still pending.

## 3. Open owner decisions recorded with the go (not asserted by the contract)

- [ ] Whether minors are served before counsel clears DPDP, and whether the Q3 DPDP legal review must finish before a
      Pathlynks-supplied profile reaches VC.
- [ ] Who owns the clinical-safety policy.
- [ ] Tele-MANAS 14416 test call for adolescents, and Hindi/Hinglish coverage, done (unverified today).
- [ ] Whether authenticated-student exposure, the anonymous route and voice go live together or one at a time.

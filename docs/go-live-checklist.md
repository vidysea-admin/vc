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

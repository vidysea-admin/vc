# HUMAN_GATE: Nights (CEO decision: who answers a student crisis at 2am)
**Opened:** 2026-10-17T14:05:14+05:30 (checker, P1 unit U0; D-087 Q11, `qa/evidence/crisis-research-20261017/proposal.md` decision 1, contract B24.7)
**Status:** OPEN, pending the CEO. Interim mode in force below.

**Question (for the CEO):** does Vidysea fund a 24x7 named on-call counsellor (own staff or a partner) to receive student
crisis alerts, or does it run days only and hand students straight to Tele-MANAS 14416 at night, disclosed plainly?
The proposal prices this as people, not software: one 24x7 seat is about 4 to 5 full-time staff or a paid on-call rota
(figures are the proposal's assumptions).

**Options:**
- **(a) `funded`:** a named, trained person is reachable 24x7, the human-alert route is enabled, and the written plan says
  what happens if nobody answers.
- **(b) `tele-manas-disclosed`:** days-only human cover; at night the student is connected straight to Tele-MANAS and told
  so; the bot never promises a counsellor it cannot deliver.

Nights-mode: tele-manas-disclosed
Mode-status: INTERIM (applies until the CEO answers; recorded because spec A20 accepts it meanwhile)
Human-alert-route: NOT ENABLED

**Blocks:** enabling the human-alert route (only under `funded`). It does not block building or the go-live script, which
accepts either mode. It does gate honesty of the fixed crisis message: under the interim mode the message discloses the
Tele-MANAS hand-off and promises no counsellor (contract B24.7, spec A11b).

**Related decisions, not blocking P1 (crisis proposal 2 and 3):** whether minors are served before counsel clears DPDP
(recorded in `g-prod.md`), and who owns the clinical-safety policy and whether a guardian is notified over the student's
wishes at level 3.
**Answer format:** the CEO's answer relayed by Umesh. The maker appends `Answered: <ISO> - <a|b> - <who>` and replaces the
`Nights-mode:` and `Mode-status:` lines above (the A20 script reads `Nights-mode:`; U5a may adjust the format and must say so).

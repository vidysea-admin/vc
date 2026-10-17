# HUMAN_GATE: G-PUBLISH (publishing the student API contract to partners)
**Opened:** 2026-10-17T14:05:14+05:30 (checker, P1 unit U0; plan v8 U0/U5b, spec A20, contract B24.9)
**Status:** OPEN

**Question:** may the P1 student API contract (OpenAPI document, WebSocket event schema, `claims[]` schema) be handed to
Pathlynks or any other partner? Publishing is outward-facing: a partner can start building against it.

**Preconditions (checked by the go-live script, spec A20, delivered in U5a):**
1. `B13-signed:` is a signed line in `qa/gates/p1-u0-amendment-signatures.md` (the production-processing exception for
   minors' text and voice, with its processor register).
2. This gate carries an `Answered:` line below.
3. The Nights mode is recorded (`qa/gates/nights.md`; `tele-manas-disclosed` is accepted meanwhile).
Voice is documented in the contract only as "disabled" unless its own gate (A10, G-PROD) has passed.

**Options:**
- **(a) Publish when the preconditions hold,** text endpoints and anonymous mode documented, voice marked disabled.
- **(b) Publish text only,** leaving the voice and WebSocket schema out of the partner copy.
- **(c) Hold,** internal fixtures only.

**Blocks:** unit U5b only. U5a (the internal contract) is not blocked.
**Answer format:** chat reply. The maker appends `Answered: <ISO> - <option>` here.

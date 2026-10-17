# HUMAN_GATE: G-KB (optional KnowledgeBase changes, and the VC-scoped KB key)
**Opened:** 2026-10-17T14:05:14+05:30 (checker, P1 unit U0; plan v8 U0/U1/U2, spec section 7, contract B24.2)
**Status:** OPEN

## Q1. Take any optional KnowledgeBase change? (this is the old plan question Q10)
**Context:** the KnowledgeBase (`D:/KnowledgeBase`) is used as-is (D-087 Q17). Spec section 7 lists three small optional
changes. VC resolves every one of them on its own side, so none is needed for P1. `D:/KnowledgeBase` is a Lab Protocol
repo with Umesh as Approver; any change goes in under its own DECISIONS entry and its own maker-checker path.

**Options:**
- **(a) None (default).** VC keeps the workarounds: source-kind from `GET /sources` + a VC config list (G1), anonymous
  turns on `/search` only (G3), `/ask` answers dropped unless `verdict=correct`, `insufficient_coverage=false` and
  `web_used=false` (G6). Cost: a recall loss whenever the KB falls back to the web.
- **(b) G1:** a source-kind field on `/search` hits and `/ask` nodes.
- **(c) G3:** a per-key no-log flag.
- **(d) G6:** a per-key switch that disables the web fallback.
- Any combination of (b)-(d).

**Blocks:** unit U1 only (and only if an option other than (a) is taken). Nothing else in P1 waits on this.
**Default if unanswered:** (a). The maker does not build U1.

## Q2. Provision the VC-scoped KnowledgeBase key (spec G4, an ops action)
**Context:** U2 starts by recording contract fixtures from the live KB API (read-only). That needs a Bearer key with
scopes `search`, `ask`, `sessions`, `gaps`, `sources`. The anonymous mode should get its own **search-only** key (scopes
`search`, `sources`) so that "never `/ask`" is structural. Keys go in `.env` only (B11), never in the tree.
**Options:** (a) Umesh provisions both keys; (b) one key for both modes (anonymous "never `/ask`" is then asserted by
tests only); (c) defer, and U2 records fixtures from the existing KB test data instead [ASSUMPTION: such data exists].
**Blocks:** the live-KB fixture recording at the start of U2, and the live-KB smoke test. Mock and frozen-fixture work does
not wait.

**Answer format:** chat reply. The maker appends `Answered: <ISO> - <Q1|Q2> - <option>` here.

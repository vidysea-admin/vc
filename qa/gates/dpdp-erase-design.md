# Gate: dpdp-erase-design
**Opened:** 2026-09-25 (data-engineer review of T-003)
**Question:** How does the engine honour a DPDP erasure or export request for a student when the knowledge graph keeps
history by retiring facts (validTo) instead of deleting them (D-003)?
**Options:**
- (a) Hard delete on erasure: purge every fact, edge, session and consent row for the student. History is lost for
  that student only. Simplest, and matches erasure literally.
- (b) Crypto-shredding: encrypt sensitive fact values per student and destroy the key on erasure. History structure
  stays, content becomes unreadable. More work.
- (c) Anonymise in place: replace identifiers and values with tombstones and keep aggregate/counsellor-learning
  signals. Needs legal confirmation that this counts as erasure.
Export is the same for all options: a per-student JSON bundle of facts, sessions, decisions and consents.
**Also needs:** the legal review in ARCHITECTURE Q3 (profiling of minors). Purpose-limited reads (purposeTags enforced
on read) are part of the same design.
**Answer format:** chat reply naming (a), (b) or (c), plus any legal constraint. The maker appends `Answered:` here
first, then records a DECISIONS entry.
**Blocks:** running packages/db/scripts/db-init.ts against the real `virtual_counsellor` database, and any
real-student-data unit. It does NOT block building or testing T-003 to T-010 offline.

Answered: 2026-09-25, Umesh in the checker session, verbatim: "hard delete with confirmation and verification".
Resolution: option **(a) hard delete**, with two required steps:
1. **Confirmation:** an erasure request is confirmed before anything is deleted, through an explicit confirm step
   recorded in the audit log (who asked, who confirmed, when). A single unconfirmed call never deletes.
2. **Verification:** after the purge, the engine reads back every collection (facts, edges, sessions, decisions,
   consents, cards/feedback, audit payloads) and proves zero documents remain for that student. It writes a
   verification receipt (counts per collection, timestamp) that carries no personal data.
Export stays as proposed: a per-student JSON bundle. Contract B15.

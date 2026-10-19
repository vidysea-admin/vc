Do a read-only senior review of the LK5 repair on branch p1/lk5 in D:/vc/.worktrees/lk5. The repair diff is 6c30cf3..13ac9b7 (code); a544ba8 is the manifest. Never edit anything.
Focus:
(1) Does the `.optional().catch(undefined)` on localized, followUpLocalized and replyLang in packages/engine/src/student/graph.ts keep `text`, `kind` and `sourceIds` strict? Is the `z.ZodType` cast at the provider call sound?
(2) Can `localizedClaimOk` in lang.ts still be bypassed by figures, units, countries or links (scheme-less hosts, IDN, mixed digits)? Does it produce false positives that would block a faithful Hindi reply too often?
(3) graph.ts: does the M2 crisis-pattern check really run on the shown text? Does localizedFollowUpOk cover every check that safeFollowUp does?
(4) Did any change alter English-only behaviour, or the order of crisisGuard?
Return Approve / Warning / Block with file:line evidence at >80% confidence, as your final message (you are read-only; the caller saves it).

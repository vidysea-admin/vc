Do a read-only senior review of branch p1/lk1w in D:/vc/.worktrees/lk1w, diff 5310e8f..e13f850. Never edit anything.
Focus:
(1) apps/api/src/index.ts startApi: is the student/anonymous provider selection correct; does the scribe/classifier still get the current provider; does a bad chain fail before connect without leaking a key in the error; is there any path where VC_TEXT_CHAIN unset changes today's behaviour?
(2) packages/engine/src/guards/concern-classifier.ts: the ollama-base throw. Is it safe, and is the error message clear?
(3) The test helpers in apps/api/tests (mustRefuseWith, stubOllamaFetch, CHAIN_ENV): can they mask a real failure or leak a server or a fetch stub between tests?
(4) .env.example: does it contain any secret?
Return Approve / Warning / Block with file:line evidence at >80% confidence, as your final message (you are read-only; the caller saves it).

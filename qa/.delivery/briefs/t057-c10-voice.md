# t057-c10-voice

Context: contract C10 (source 2) needs one spoken question answered by voice using the same student context. Umesh approved the following in THIS session (2026-10-28):
- VC_VOICE_MODEL = gemini-3.1-flash-live-preview.
- The real-data voice probe runs ONLY on Umesh's allowed TEST users (VC_TEST_PATHLYNKS_USER_ID / VC_TEST_VIDYSEA_USER_ID from .env).
- There is NO cost cap, but log each session's duration and an estimated cost.

Task:
1. In D:/vc/.worktrees/vc-completion/.env, set VC_VOICE_MODEL=gemini-3.1-flash-live-preview with a small script that rewrites only that line, or adds it if absent. Never print any other value. Do not touch .env.example.
2. Read qa/.delivery/requests/completion-real-voice.mts in full.
   - Run it with --dry-run first and record the output.
   - Then run it in execute mode against the test user, with the existing synthetic spoken-question audio in qa/.delivery/requests/ (synthetic-preference.wav, synthetic-yes.wav).
   - The evidence you need: the provider finalized the spoken question; a spoken or text answer came back that uses the student's context; and, if the probe supports it, the scoped virtual_counsellor readback.
   - If the probe needs the running VC API to have reloaded VC_VOICE_MODEL, do NOT restart it. Report that as the blocker and stop after the dry-run.
3. Verify that gemini-3.1-flash-live-preview is accepted (no model-not-found). If the model id is rejected, record the exact provider error. Do not substitute a different model.
4. Write qa/evidence/t057/c10-voice-probe.md with the commands, model, sessions, durations, estimated cost, results and limits. Note that the manual browser widget voice turn is still a separate step. No real student rows or secrets go in the file; the transcript text of the synthetic question is fine.

import fs from "node:fs";
const D = [
  // C14
  { id: "A-C14a", what: "crisis record skipped again once the socket is closing (cycle-1 state check)", find: "    const words = c.crisisWords;\n    c.crisisWords = undefined;", replace: "    if (c.state === \"closing\" || c.state === \"closed\") return;\n    const words = c.crisisWords;\n    c.crisisWords = undefined;" },
  { id: "A-C14b", what: "fenced student is escalated anyway", find: "    if (flag === \"fenced\") {\n      logEvent(\"voice_crisis_escalate_skipped_fenced\");\n      return;\n    }", replace: "    if (false as boolean) {\n      logEvent(\"voice_crisis_escalate_skipped_fenced\");\n      return;\n    }" },
  { id: "A-C14c", what: "unconsented-minor skip leaves no log", find: "      logEvent(\"voice_crisis_escalate_skipped_text_not_stored\"); // D-093 4A: no text is kept for an unconsented minor\n", replace: "" },
  { id: "A-C14d", what: "unconsented minor IS escalated (persistText check removed)", find: "    if (!c.persistText) {\n      logEvent(\"voice_crisis_escalate_skipped_text_not_stored\");", replace: "    if (false as boolean) {\n      logEvent(\"voice_crisis_escalate_skipped_text_not_stored\");" },
  { id: "A-C14e", what: "escalation requires the flag write to have succeeded", find: "    if (flag === \"fenced\") {\n      logEvent(\"voice_crisis_escalate_skipped_fenced\");\n      return;\n    }", replace: "    if (flag !== \"ok\") {\n      logEvent(\"voice_crisis_escalate_skipped_fenced\");\n      return;\n    }" },
  { id: "A-C14f", what: "fenced flag write logs nothing before returning (skip leaves no line)", find: "      logEvent(\"voice_crisis_escalate_skipped_fenced\");\n      return;\n    }\n    // No words", replace: "      return;\n    }\n    // No words" },
  // C15
  { id: "A-C15a", what: "no quota refusal after the supersede re-read", find: "      remainingMs = limits.voiceMinutesPerMonth * 60_000 - used;\n      if (remainingMs <= 0) {", replace: "      remainingMs = limits.voiceMinutesPerMonth * 60_000 - used;\n      if (false as boolean) {" },
  { id: "A-C15b", what: "month not re-read after the supersede (stale usage)", find: "        used = (await getStudentUsage(c.db, { studentId, month: usageMonth(nowDate()) })).voiceMs;\n      } catch (err) {\n        logEvent(\"voice_start_failed\", err);\n        sendError(c, \"internal\");\n        void finalize(c, 1011);\n        return;\n      }\n      if (c.state !== \"starting\") return;", replace: "      } catch (err) {\n        logEvent(\"voice_start_failed\", err);\n        sendError(c, \"internal\");\n        void finalize(c, 1011);\n        return;\n      }\n      if (c.state !== \"starting\") return;" },
  { id: "A-C15c", what: "session cap ignores the remaining month", find: "c.capMs = Math.min(limits.voiceSessionMaxMinutes * 60_000, remainingMs);", replace: "c.capMs = limits.voiceSessionMaxMinutes * 60_000;" },
  // C16 / C10
  { id: "A-C16a", what: "waiter steps aside when the newest start went away (cycle-1 rule)", find: "      if (newest === undefined) {\n        latestStart.set(c.key, c);\n        return false;\n      }\n", replace: "" },
  { id: "A-C16b", what: "finalize does not drop a closing conn from latestStart at once", find: "      if (latestStart.get(c.key) === c) latestStart.delete(c.key);\n      clearTimers(c);", replace: "      clearTimers(c);" },
  { id: "A-C16c", what: "supersede loop runs once", find: "    for (;;) {\n      const previous = activeByStudent.get(c.key);", replace: "    for (let once = 0; once < 1; once++) {\n      const previous = activeByStudent.get(c.key);" },
  { id: "A-C16d", what: "newest-wins removed entirely (no step aside)", find: "      const newest = latestStart.get(c.key);\n      if (newest === undefined) {", replace: "      if (Date.now() > 0) return false;\n      const newest = latestStart.get(c.key);\n      if (newest === undefined) {" },
  { id: "A-C10a", what: "closed waiter takes the slot (state guard before activeByStudent.set removed)", find: "    if (c.state !== \"starting\") return;\n    activeByStudent.set(c.key, c);", replace: "    activeByStudent.set(c.key, c);" },
  { id: "A-C10b", what: "start timer ignores 'starting'", find: "if (c.state === \"awaiting_start\" || c.state === \"starting\") void finalize(c, 1008);", replace: "if (c.state === \"awaiting_start\") void finalize(c, 1008);" },
  { id: "A-C10c", what: "late provider session not closed when the socket left", find: "        session.close(\"client gone before start finished\");", replace: "        void 0;" },
  // C17 / C18 / C19
  { id: "A-C17a", what: "escalation port built outside the retried write", re: "    const escalated = await crisisWrite\\(c, \"voice_crisis_escalate_failed\", async \\(\\) => \\{\\n      // Built inside[^\\n]*\\n      const escalate = deps\\.escalateForTenant!\\(c\\.claims\\.tenantId, c\\.db\\);", replace: "    const escalate = deps.escalateForTenant!(c.claims.tenantId, c.db);\n    const escalated = await crisisWrite(c, \"voice_crisis_escalate_failed\", async () => {" },
  { id: "A-C18a", what: "escalation falls back to the latest student turn's words", find: "const text = words !== undefined && words !== \"\" ? words : VOICE_CRISIS_NO_WORDS_TEXT;", replace: "const text = words !== undefined && words !== \"\" ? words : (c.lastUser?.text ?? VOICE_CRISIS_NO_WORDS_TEXT);" },
  { id: "A-C18b", what: "crisis words taken from any earlier student turn (no seq adjacency)", find: "c.crisisWords = c.lastUser?.seq !== undefined && c.lastUser.seq === t.seq - 1 ? c.lastUser.text : undefined;", replace: "c.crisisWords = c.lastUser?.text;" },
  { id: "A-C18c", what: "no-words crisis is not escalated (skip)", find: "const text = words !== undefined && words !== \"\" ? words : VOICE_CRISIS_NO_WORDS_TEXT;", replace: "if (words === undefined || words === \"\") return;\n    const text = words;" },
  { id: "A-C19a", what: "drain wait unbounded (timer never resolves)", find: "drainTimer = setTimeout(() => resolve(true), drainTimeoutMs);", replace: "drainTimer = setTimeout(() => void 0, drainTimeoutMs);" },
  { id: "A-C19b", what: "drain timeout not logged", find: "if (timedOut) logEvent(\"voice_drain_timeout\");", replace: "void timedOut;" },
  { id: "A-C19c", what: "drain wait ignores the dep (hard 10 s)", find: "deps.drainTimeoutMs !== undefined && Number.isFinite(deps.drainTimeoutMs) && deps.drainTimeoutMs > 0 ? deps.drainTimeoutMs : VOICE_DRAIN_TIMEOUT_MS_DEFAULT;", replace: "VOICE_DRAIN_TIMEOUT_MS_DEFAULT;" },
  // C12 / C13
  { id: "A-C12a", what: "crisis write not retried", find: "export const VOICE_CRISIS_WRITE_ATTEMPTS = 2;", replace: "export const VOICE_CRISIS_WRITE_ATTEMPTS = 1;" },
  { id: "A-C12b", what: "escalation carries unredacted words", find: "c.lastUser.text = clamp(stored, 2000);", replace: "c.lastUser.text = clamp(t.text, 2000);" },
  { id: "A-C13a", what: "prune timer never armed", find: "if (pruneTimer !== undefined || retained.size === 0 || shuttingDown) return;", replace: "return;" },
  // C2
  { id: "A-C2a", what: "audience not checked", find: "      audience: VOICE_WS_AUDIENCE,\n", replace: "" },
  { id: "A-C2b", what: "replay allowed", find: "    if (usedTokens.has(claims.jti)) return refuse(socket, 401, \"Unauthorized\");\n", replace: "" },
  { id: "A-C2c", what: "token for another thread accepted", find: " || claims.threadId !== m[2])", replace: ")" },
  { id: "A-C2d", what: "token for another student accepted", find: "!claims || claims.studentId !== m[1] || ", replace: "!claims || " },
  { id: "A-C2e", what: "expiry not enforced", find: "      currentDate: new Date(nowMs),", replace: "      currentDate: new Date(0)," },
  { id: "A-C2f", what: "issuer not checked", find: "      issuer: VOICE_WS_ISSUER,\n", replace: "" },
  // C9 / C11 / C4 / C6 / C7
  { id: "A-C9a", what: "socket cap ignored", find: " || conns.size >= maxSockets) return refuse(socket, 503", replace: ") return refuse(socket, 503" },
  { id: "A-C11a", what: "pre-start cap ignored", find: ">= VOICE_MAX_PRESTART_SOCKETS_PER_STUDENT) return refuse(socket, 429", replace: ">= 100000) return refuse(socket, 429" },
  { id: "A-C11b", what: "session-route limiter ignored", find: "if (!verdict.allowed) return fail(429", replace: "if (false as boolean) return fail(429" },
  { id: "A-C4a", what: "silence default 30 s", find: "export const VOICE_SILENCE_TIMEOUT_MS_DEFAULT = 60_000;", replace: "export const VOICE_SILENCE_TIMEOUT_MS_DEFAULT = 30_000;" },
  { id: "A-C6a", what: "unconsented minor persists text", find: "persistText: !claims.minor || claims.guardianConsent,", replace: "persistText: true," },
  { id: "A-C6b", what: "stored transcript unredacted", find: "redactPii(text, { knownNames: [...c.knownNames] }).text", replace: "text" },
  { id: "A-C7a", what: "minutes not recorded", find: "        if (elapsed > 0) {", replace: "        if (false as boolean) {" },
];
fs.writeFileSync(process.argv[2], JSON.stringify(D, null, 1));
console.log(D.length);

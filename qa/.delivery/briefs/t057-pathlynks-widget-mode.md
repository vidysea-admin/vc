Task t057-pathlynks-widget-mode (item 7b, Umesh asked): offer Pathlynks the VC widget (our blue-and-white UI, apps/widget/src/vc-widget.js) instead of its native AIChatWidget, as an env-gated LOCAL option. Default unset = native AIChatWidget unchanged.

Checkouts: PF = D:/vc/.worktrees/quest-pathlynks-frontend (Next.js dev on :3000, running, hot-reloads). PB = D:/vc/.worktrees/quest-pathlynks-backend (:5001) proxies /api/pathlynks-quest/ai/* to VC with the partner key. Widget source: D:/vc/.worktrees/vc-completion/apps/widget is READ ONLY for you (another agent is editing vc-widget.js right now). Integration contract: docs/partner-integration.md (proxy mode section 2) and apps/widget/README.md.

DO:
1. Read how the widget proxy mode is configured (base URL, paths it calls, auth header/token source, data-* attributes or init config) and compare with the PB /api/pathlynks-quest/ai/* routes (paths, methods, request/response shapes, how PB reads the Pathlynks JWT). Produce a compat table with file:line on both sides.
2. If compatible (or compatible via widget config only): in PF add a flag NEXT_PUBLIC_VC_WIDGET_MODE=1 that, on the career-quest page, renders a loader for NEXT_PUBLIC_VC_WIDGET_SCRIPT_URL (http://localhost:8790/vc-widget.js) configured for PB proxy mode with the logged-in user token, instead of AIChatWidget. Allow the script origin in PF CSP only when the flag is set. Minimal, in place.
3. If NOT compatible, implement nothing in PB; report the exact gaps and the smallest adapter plan (which side, which file:line).
4. Do NOT set the flag in any .env* file (a headed walk of the native widget runs soon); report the exact keys/values and restart step to turn it on. Do not start/stop servers.

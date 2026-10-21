# Falsification + probe evidence, chk golive-launcher (cycle 0)
Copies outside the worktree: /c/Users/Lenovo/AppData/Local/Temp/claude/d--vc/2b04f90e-6b56-4682-a76c-d8515b93405c/scratchpad/fc/f1..f5 (robocopy minus .git/node_modules, node_modules junctioned read-only to the worktree's). Bound tree untouched (git status clean at the end).
f1 green: ℹ pass 8 ℹ fail 0 
f1 red: ℹ pass 6 ℹ fail 2 
f2 green: ℹ pass 8 ℹ fail 0 
f2 red: ℹ pass 7 ℹ fail 1 
f3 green: ℹ pass 5 ℹ fail 0 
f3 red: ℹ pass 4 ℹ fail 1 
f4 green: ℹ pass 52 ℹ fail 0 
f4 red: ℹ pass 49 ℹ fail 3 

F1 (C3) main.ts:52  raw = req.headers['x-forwarded-for'] ?? req.headers[CLIENT_KEY_HEADER]   -> red: ✖ b: the client key is X-Real-IP; X-Forwarded-For;✖ b: over real HTTP through launch(), the limiter keys on X-Real-IP and a rotating X-Forwarded-For does not buy a fresh bucket;
F2 (C2) main.ts:103 required list drops VC_KB_ANON_API_KEY                                     -> red: ✖ a: VC_ANONYMOUS_ENABLED=true without the KB URL or the search-only key refuses to start, naming the variable
F3 (C1) source-kind.ts:207 served answer no longer carries insufficient_coverage:false          -> red: ✖ port.askKnowledgeBase applies the serve rule; a served answer satisfies the engine's isServedAsk, a withheld one never does
F4 (C1) source-kind.ts:135 labelAllowed always true                                             -> red: ✖ search_kb: GET /search?q&k with Bearer; hits with null turn/session are dropped and counted; each hit is source-kind tagged; unknown = restricted;✖ U2b: speakerLabel passes only for seminar/toc;✖ port.searchKb returns exactly the hits the MCP search_kb tool returns;

F5 (C4, static check nginxcheck.mjs): worktree conf GREEN; X-Real-IP -> $http_x_real_ip RED (not set from $remote_addr; client header forwarded); proxy_pass :8081 RED

Secret-leak probe (sentinel values in VC_KB_*_KEY, MONGODB_URL password, VC_JWT secret, VC_LLM_API_KEY, short student JWT secret), real CLI 'pnpm -C apps/api start', stdout+stderr grep SENTINEL = 0 hits in all cases:
  anon on, no LLM provider  -> exit 1 'loadProviderConfig: VC_LLM_PROVIDER must be ...'
  chat on, short JWT secret -> exit 1 'LauncherConfigError: ... student JWT configuration is invalid (JwtConfigError: VC_STUDENT_JWT_HS256_SECRET must be at least 32 bytes)'
  speakers file missing     -> exit 1 'LauncherConfigError: VC_SPEAKERS_FILE is set but the file cannot be read as JSON' (path not echoed)
  anon on, mock provider    -> exit 1 'GoLiveRefusedError: go-live refused for anonymous: p1-u0-amendment-signatures.md: B13-signed ... (found "PENDING")' (fail closed on the A20 gate)
  nothing on, Mongo down    -> exit 1 'MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:1' (no credentials in message)

# completion-platform — S12 bounded contribution

Owner: completion-platform. Status: local implementation self-checked; root integration and final independent checking pending. Parent T-057 cycle2 STALLED history/receipts/costs/counterexamples unchanged; no reset, acceptance, helper or final-check dispatch. Main checkout/index untouched.

## Stable interfaces for root (prospective until green evidence below)
- Existing package @vc/mcp-pathlynks will export createVidyseaPort(VidyseaPortConfig). It has getStudentProfile, getShortlistedProgrammes, getProfileAssessment, getCompareList (explicit unsupported), getStatus. No getSavedCareers or psychometric-completion aliases for Vidysea. Result envelope remains PathlynksResult; profile/assessment source labelled vidysea.
- Vidysea config tables: {profile:'users',student:'students',shortlist:'student_shortlisted_courses',assessment:'ai_profile_assessments'}. All owner reads join students.id = users.id with students.deleted_at IS NULL, users.is_active IS TRUE, users.disabled_at IS NULL. No users.deleted_at/student.user_id assumptions.
- SourcesFile stays version1/top-level siteId/sources. Source records gain optional paired siteId/platform ('pathlynks'|'vidysea') and enabled boolean; old absent metadata means legacy top-level siteId + Pathlynks. Root seedSourcesFromConfig must use source.siteId ?? file.siteId and persist platform; select authenticated tenant, never bootstrap fallback for unknown tenants.
- SourceConfig enforces platform credential prefixes. A binding helper will require kind + site + source id + exact destination + ref against trusted config. Root must use it before env resolution AND reject/clear encrypted-secret retarget. Existing admin encrypted path retained; this task does not edit store/Admin.
- buildPgConfig optional binding argument guards Vidysea refs/CA file refs. Runtime encrypted credentials should be passed in a private env object, with the binding based on server-owned seeded config; no arbitrary browser/env lookup.
- Vidysea nav proven by map: /student/shortlisted-programmes, /course-compare, /college-compare, /student/u/profile, /student/ai-counsellor. No Pathlynks career IDs or URL comparison ids. Root owns nav routing, central index/chat/voice/graph/OpenAPI and Admin DTO consumers.
- SQL role name absent from supplied nonsecret metadata. Vidysea seed disabled with explicit UNPROVISIONED placeholder role; team must provision readonly user and password/CA. No inferred production credentials or consent.

## Authority/readiness
Read installed maker/checker, project AGENTS/ARCHITECTURE, D-120, supplied S12 PLAN approval and completion-vidysea-map. Existing protocol pin remains proportional-verification/2026-10-19.17; no new readiness/repin/tick success claim. Local fs fallback because exec_command failed before process creation. Memory lookup rejected by auto-review and omitted.

## Checks
Pending focused existing-file red/green and package-only typechecks. No network/DB/provider/full-suite/commit/push/deploy permitted.

## Final interfaces and owner handback

- `mcp/pathlynks/src/port.ts:createVidyseaPort` / `VidyseaPortConfig` / `VidyseaPort` exported by the existing barrel. Native methods: getStudentProfile, getShortlistedProgrammes, getProfileAssessment, getCompareList (unavailable/unsupported), getStatus. Same fixed result envelope; unsupported extends UnavailableCause.
- Existing createPathlynksPort SQL/owner/table block is byte-identical to this contribution's start snapshot (comparison true). Its seven-table SQL, four method API, G1 override and existing fences/deadlines retained. Common runner moved in-place to private createReadExecutor; no public arbitrary SQL API.
- `packages/schemas/src/sources.ts:postgresSourceForTenant(file, verifiedTenant)` returns exactly one enabled postgres source for the exact server-verified tenant, or undefined; no default for unknown/ambiguous/disabled tenants. Old version1 source records without metadata keep the old top-level-site + Pathlynks meaning.
- `boundSourceCredentialRef(source, seeded, defaultSiteId)` checks exact site/id/kind/platform/destination/ref, disabled state and GitHub repository/branch before returning an allowed environment name; no env values accessed. `credentialRefPatternFor(kind, platform?)` defaults to legacy Pathlynks and exposes only VIDYSEA_DB_* for explicit Vidysea postgres.
- `buildPgConfig(connection, env, credentialBinding?)` keeps legacy callers compatible. Vidysea connections require {platform:'vidysea',siteId:'vidysea',sourceId:'vidysea-db',seed:PgConnectionConfig}; actual connection host/port/database/user/sslmode/passwordRef/caFileRef must exactly match the trusted seed. Only VIDYSEA_DB_CA_FILE may be the scoped CA env name. The Vidysea port rejects unbound/non-Vidysea config before env access; fake connect is a local test seam. Root must derive the binding from trusted server configuration, never source it from a browser request.
- For env-backed credentials, root must first apply boundSourceCredentialRef against immutable seeded records. For encrypted Admin credentials, root must first enforce stored kind/site/destination identity and retarget rejection/clear + reprovision; the driver binding may then use that trusted provisioned connection. A caller-supplied self-asserted seed is not an authorization check.
- No type/schema consumer may label native programmes as careers, profile_classification as psychometric completion or comparison as a server-owned list. Native source labels/enums in profile/graph consumers remain their assigned owners' work.

## Exact focused checks (local synthetic only)

Initial red, before source implementation:

`node node_modules/tsx/dist/cli.mjs --test --test-name-pattern=S12 mcp/pathlynks/tests/port.test.ts packages/schemas/tests/sources.test.ts`

Exit1; tests5/pass0/fail5. Missing createVidyseaPort and boundSourceCredentialRef, source metadata rejected, unbound Vidysea credential unexpectedly accepted.

Tenant-selector red:

`node node_modules/tsx/dist/cli.mjs --test --test-name-pattern="S12 tenant selector" packages/schemas/tests/sources.test.ts` (actual execFile argument kept the entire pattern as one argument). Exit1; tests1/pass0/fail1; postgresSourceForTenant missing.

Self-check falsification red:

`node node_modules/tsx/dist/cli.mjs --test --test-name-pattern="S12 Vidysea connection" mcp/pathlynks/tests/port.test.ts` (pattern passed as one argument). Exit1; tests1/pass0/fail1; proxy observed PATHLYNKS_DB_PASSWORD / VC_ADMIN_MASTER_KEY lookups from unbound Vidysea config. Repaired inside this same named contribution by rejecting unbound platform configs before env access; subsequent S12 run7/7 green. No provider/connection was attempted: proxy always returned undefined.

Final exact argv-based commands and complete stdout/stderr:

```text
node node_modules/tsx/dist/cli.mjs --test mcp/pathlynks/tests/port.test.ts mcp/pathlynks/tests/privileged-override.test.ts mcp/pathlynks/tests/server.test.ts packages/schemas/tests/sources.test.ts
exit=0
✔ VA12 port exposes exactly the four read methods (1.4444ms)
✔ VA12 getStudentProfile binds the verified student id as $1 and sets statement_timeout (1.17ms)
✔ VA12 getSavedCareers binds the verified student id as $1 and sets statement_timeout (0.3171ms)
✔ VA12 getCompareList binds the verified student id as $1 and sets statement_timeout (0.2351ms)
✔ VA12 getAssessmentStatus binds the verified student id as $1 and sets statement_timeout (0.1894ms)
✔ VA12 each method queries its own configured table (2.0041ms)
✔ VA12 a hostile student id is refused before any connection (0.2278ms)
✔ VA12 row cap: 500 rows -> 50 truncated; 50 -> not truncated; 51 -> truncated (0.8193ms)
✔ VA12 fail closed when INSERT is true on users (0.5332ms)
✔ VA12 fail closed when INSERT is true on user_grade (0.5196ms)
✔ VA12 fail closed when INSERT is true on grade (0.2928ms)
✔ VA12 fail closed when INSERT is true on student_saved_careers (0.2279ms)
✔ VA12 fail closed when INSERT is true on student_career_compare (0.2301ms)
✔ VA12 fail closed when INSERT is true on career_option (0.2794ms)
✔ VA12 fail closed when INSERT is true on assessment_response (0.304ms)
✔ VA12 fail closed when UPDATE is true on users (0.1788ms)
✔ VA12 fail closed when UPDATE is true on user_grade (0.2544ms)
✔ VA12 fail closed when UPDATE is true on grade (0.2976ms)
✔ VA12 fail closed when UPDATE is true on student_saved_careers (0.1536ms)
✔ VA12 fail closed when UPDATE is true on student_career_compare (0.1855ms)
✔ VA12 fail closed when UPDATE is true on career_option (0.6974ms)
✔ VA12 fail closed when UPDATE is true on assessment_response (0.2312ms)
✔ VA12 fail closed when DELETE is true on users (0.1594ms)
✔ VA12 fail closed when DELETE is true on user_grade (0.3287ms)
✔ VA12 fail closed when DELETE is true on grade (0.195ms)
✔ VA12 fail closed when DELETE is true on student_saved_careers (0.2567ms)
✔ VA12 fail closed when DELETE is true on student_career_compare (0.1499ms)
✔ VA12 fail closed when DELETE is true on career_option (0.1973ms)
✔ VA12 fail closed when DELETE is true on assessment_response (0.1719ms)
✔ VA12 a privilege-check error fails closed and is recorded (0.2509ms)
✔ VA12 an empty privilege result fails closed (0.2234ms)
✔ VA12 connect error -> typed unavailable, nothing thrown, no secret leaked (0.1738ms)
✔ VA12 query error and SET error -> typed unavailable, no leak, connection closed (0.2182ms)
✔ VA12 a hung query times out into unavailable (cause timeout) (55.8501ms)
✔ VA12 every statement issued is SELECT or a SET/privilege probe; never INSERT/UPDATE/DELETE/DDL (1.3214ms)
✔ VA12 table names must be in the allow-list and be plain identifiers (0.3832ms)
✔ VA12 buildPgConfig reads the password from the env NAME and never holds a connection string (0.196ms)
✔ VA12 missing password env -> unavailable (not_configured) without connecting (0.1318ms)
✔ Q1 R4: explicit owner-rooted projections and every joined table are guarded (0.6012ms)
✔ Q7 TLS: configured CA file is loaded, missing CA fails closed, verification always stays on (3.7447ms)
✔ Q7 populated relational fixture: NULL legacy student_id, latest active grade, labelled joins and latest mixed/draft responses (8.6521ms)
✔ Q7 assessment aggregation stays untruncated beyond list cap; late connections are closed after timeout (79.0822ms)
✔ Q7 TLS certificate rejection is unavailable without driver details (0.3696ms)
✔ S12 Vidysea finite owner joins, labelled native data and SQL/row bounds (1.1641ms)
✔ S12 Vidysea rejects invalid owners, wrong tables and Pathlynks privileged-role override (0.4325ms)
✔ S12 Vidysea driver refuses unbound/cross-platform/destination/CA refs before lookup (0.1607ms)
✔ S12 Vidysea connection never reads Pathlynks or generic environment credentials (0.3995ms)
✔ S12 same external owner id stays in its separately constructed platform adapter (0.476ms)
✔ G1: without the override a writer role is refused and no data SELECT is issued (fail closed, as built) (1.7499ms)
✔ G1: with PATHLYNKS_ALLOW_PRIVILEGED_ROLE=1 a writer role reads, through SELECT-only SQL in a read-only transaction, with one startup warning event and no secret in it (0.7274ms)
✔ G1: only the exact value 1 turns the override on (true, yes, 0, empty and ' 1' do not), and the explicit config option wins over the env (0.9354ms)
✔ G1: the override does not weaken the other guards: a bad student id is refused, a failed SET still fails closed, a SELECT error is a typed unavailable (0.4532ms)
✔ VA12 tool arguments and injected text never change the queried student id (15.9826ms)
✔ VA12 no verified student -> refused, no connection (3.0096ms)
✔ VA12 unavailable is a normal tool result, not a thrown error (1.5175ms)
✔ VA12 truncated results are flagged in the tool payload (1.209ms)
✔ VA3: the real config/sources.json parses: four Pathlynks GitHub branches + separate Pathlynks/Vidysea Postgres (8.7638ms)
✔ VA3: the real config/sources.json holds env NAMES only (no secret-like field or value) (0.6922ms)
✔ VA3: SourceConfig / SourcesFile are strict (an unknown key is a parse failure) (1.4183ms)
✔ VA3 rejection: an unknown key (8.2826ms)
✔ VA3 rejection: a field named password / secret / token (any case) holding a value; the value is never echoed (33.2072ms)
✔ VA3 rejection: a passwordRef / tokenRef that is not an env-name shape (39.1148ms)
✔ VA3 rejection: a connection string with embedded credentials (any field, any scheme) (6.3962ms)
✔ VA3 rejection: a Postgres source with sslmode outside the enum (20.4193ms)
✔ VA3: tables must be non-empty; duplicate source ids, bad version and non-JSON are refused (12.7206ms)
✔ VA3: other secret-shaped literals are refused wherever they sit (private key block, JWT, GitHub token prefix) (0.4305ms)
✔ VA3: parseSourcesFile is the pure twin of loadSourcesFile (0.4566ms)
✔ VA3: .env.example lists every *Ref name found in config/sources.json with an empty value (1.4776ms)
✔ VA1 (config side): .env.example holds empty values for the admin secrets it names (0.3725ms)
✔ fix1 R1: a source naming VC_ADMIN_MASTER_KEY, VC_ADMIN_JWT_SECRET or MONGODB_URL as its credential ref is refused; PATHLYNKS_* and GITHUB_* names pass (0.9361ms)
✔ fix2 F1: a github source naming PATHLYNKS_DB_PASSWORD as its tokenRef (the DB password sent to GitHub as a bearer) is refused; a postgres source naming GITHUB_TOKEN is refused (0.4402ms)
✔ S12 sources: legacy version1 and both-site metadata remain compatible and separated (0.477ms)
✔ S12 source env binding requires exact site/kind/id/destination and never crosses platforms (1.0638ms)
✔ S12 tenant selector refuses unknown/ambiguous/disabled without bootstrap fallback (1.079ms)
ℹ tests 74
ℹ suites 0
ℹ pass 74
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 790.3712
stderr: (empty)
```

```text
node node_modules/typescript/lib/tsc.js --noEmit -p mcp/pathlynks/tsconfig.json
exit=0
(empty stdout)
stderr: (empty)
```

```text
node node_modules/typescript/lib/tsc.js --noEmit -p packages/schemas/tsconfig.json
exit=0
(empty stdout)
stderr: (empty)
```

## Self-check limits and integration actions

- Focused checks:74/74, no cancellations/skips; both affected package typechecks exit0. Synthetic mocks assert fixed SQL projection, exact joins/bind parameters/caps, UUID rejection, independent platform adapters, privilege refusal, TLS/CA/secret refs, tenant selection and legacy compatibility. They do not execute PostgreSQL or prove deployed migrations, actual row ownership at runtime, authenticated host journeys, nav rendering or real data/provider correctness.
- Root owns seedSourcesFromConfig per-source site/platform/enabled handling; Admin source DTO/credential retarget protection; both text and voice authenticated tenant resolver and per-site cache/profile/nav; native graph tool dispatch/labels, OpenAPI and all final integration/security/data/AI/browser checks. These remain open integration requirements, not passed by this contribution. No central API file or admin-store was edited.
- Team SQL role/password/official CA configuration remains missing. Disabled Vidysea seed is not live configuration. Team also supplies deployed KB URL/key, verified real-account eligibility/consent and production audio/config.
- Retained original T-057 cycle2 STALLED remains authoritative history. No manifest/cycle reset, checker verdict, ledger change, product acceptance, release status or root closeout asserted.
- No helpers/subagents, new product module/collection/test file, full suite, provider/DB/network call, model override, git mutation/commit/push/deploy. One new QA evidence file only. Read-only git diff compares against HEAD and includes pre-existing isolated WIP; it is not a claim that all displayed diff lines were authored here.

## Owned file identities (task-start snapshot -> final)

- mcp/pathlynks/src/port.ts
  - start: b9f1c61a602a372c75721c26ae8c70c2ad514b319943ea39576ef727707c103d
  - final: 11ec9e67572b9f65dd11341675d7952c078ee277bd6a894aac71ffbde8f0b4a8
- mcp/pathlynks/src/connect.ts
  - start: e29744269f27daab65e4898d0531c8bcc3e9dea5ea817e1ea539f7578d54e5e1
  - final: 031cbfec3b22421d7c150848e2deb2307cc553e3a30dea5f236ab0942c136adf
- mcp/pathlynks/src/index.ts
  - start: eb6eaa4147ec68cd45e3e1f3eafc4e2775ddcdde2b68ec7f7331a4607c6dc909
  - final: b43b4427bf55facc30135227556dd98c414a1775a5a1bed723d903d7469a100d
- packages/schemas/src/sources.ts
  - start: 727d12279f1593ad4d98839dddb4ae0c8c4a35fb2bd5124597cb9c05c449ccf8
  - final: 27b43176d63219d5650c03b22aee7454c408075ba7b63329644a4f8715bc07ce
- config/sources.json
  - start: 07437dc93559067cb7bdb38829226f12d762a1f4d2b06c5445d220fea671d226
  - final: c4bb1a3ed6df93335608253d4efa8b210605b54427a2712a9622e527f51d8c4c
- mcp/pathlynks/tests/port.test.ts
  - start: f13ccd2f75ce60ac6fc7e46bc268ba090ec0630be8efbd3f2e4a67310da30922
  - final: 572d4009a9e81e6be3dee8c38e5cfaddefc2645862cd75276bab04fc8eb74afc
- packages/schemas/tests/sources.test.ts
  - start: a7d87ca1ae1eec68e224db4d4bde2ea68dd6d4ce8c0ed5cb6029710db7d4adc6
  - final: 26e0cc738df74e140f93abc66de04672388e37c4cba2ed0bd3079e5f15db6dee
- docs/partner-integration.md
  - start: 45dc7a1653ff02429e587cb63fa30918872b0b1522814a7ef28c6503a5e90245
  - final: 00105aa907a3f03171f06b27eced09839d8d2c565f8dd4375e3ea96ca351afd7
- .env.example
  - start: eb316baaf03af047b8b483c412b328668ae07b381725ede7d7ec5f71bd9e4877
  - final: 3315fb10fa00ce16edb7beb74ccf5c8f9aef0f96b9f9f7bb664e53e6c9a0e8e4

Installed maker SHA256 236bc0e7c075f9729ef464dbd8aa2bdbec02754e95e228c936480c96d4c8fe39; checker SHA256 835d6a2764c50567b4573c7aa8f4f991430e2240a46107256b4a07d934799cf1 freshly match supplied preserved pin. No tick --policy-check execution or enforcement liveness is claimed.

Final whitespace self-check: `git diff --check -- mcp/pathlynks/src/port.ts mcp/pathlynks/src/connect.ts mcp/pathlynks/src/index.ts packages/schemas/src/sources.ts config/sources.json mcp/pathlynks/tests/port.test.ts packages/schemas/tests/sources.test.ts docs/partner-integration.md .env.example` exit0, stdout empty; stderr only existing LF/CRLF working-copy notices. No git index mutation.

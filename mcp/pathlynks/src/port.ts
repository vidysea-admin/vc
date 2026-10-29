/**
 * Pathlynks read port (vc-admin-control S5, VA12).
 *
 * Boundary rules, all enforced here and nowhere else:
 *  - Only four read methods; no generic query entry point.
 *  - The student id is the argument of every method and is bound as `$1`; it is never placed in SQL text.
 *    The caller is the engine / the MCP server below, which take the id from the verified auth context only.
 *  - Table names come from the configured allow-list (config/sources.json `tables`), are validated as plain
 *    identifiers once at construction, and are the only text interpolated into SQL (Postgres cannot bind identifiers).
 *  - Every connection: `SET statement_timeout = 3000`, `SET default_transaction_read_only = on`, then a
 *    has_table_privilege(INSERT/UPDATE/DELETE) probe for every configured table. Any true, error or empty answer
 *    fails closed: no data SELECT is issued.
 *  - Results are capped at 50 rows (`truncated` flags the cut). Failures are typed results, never thrown, and carry a
 *    fixed `cause` constant only (no driver message, host, user or password).
 */
import { buildPgConfig, defaultConnect, type PgConnectionConfig, type PgCredentialBinding } from "./connect.js";

export const STATEMENT_TIMEOUT_MS = 3000;
export const ROW_CAP = 50;
const DEFAULT_QUERY_TIMEOUT_MS = 5000;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

export interface PgClientLike {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}
export type ConnectFn = () => Promise<PgClientLike>;

export type PathlynksRow = Record<string, unknown>;
export type UnavailableCause =
  | "unsupported"
  | "not_configured"
  | "connect_error"
  | "query_error"
  | "timeout"
  | "privilege_check_failed"
  | "privilege_check_error";
export type PathlynksResult =
  | { ok: true; rows: PathlynksRow[]; truncated: boolean }
  | { ok: false; reason: "unavailable"; cause: UnavailableCause }
  | { ok: false; reason: "refused"; cause: "invalid_student_id" };

export interface PathlynksPort {
  getStudentProfile(studentId: string): Promise<PathlynksResult>;
  getSavedCareers(studentId: string): Promise<PathlynksResult>;
  getCompareList(studentId: string): Promise<PathlynksResult>;
  getAssessmentStatus(studentId: string): Promise<PathlynksResult>;
  /** T-057 (D-124): latest fit-score calculation, career categories by fit score. `unsupported` when the tables are not configured. */
  getCategoryFits(studentId: string): Promise<PathlynksResult>;
  /** T-057: latest calculation, subcategories by fit score with up to 5 of their top career labels. */
  getCareerFits(studentId: string): Promise<PathlynksResult>;
  /** T-057: latest non-excluded score per trait (name, module, level, normalised score). */
  getTraitScores(studentId: string): Promise<PathlynksResult>;
  /** T-057: the latest accepted Combined Report's overview only (summary, strengths, areas to grow, recommendation). */
  getCombinedReportSummary(studentId: string): Promise<PathlynksResult>;
  /**
   * D-134 Career Quest reads (Mongo `pathlynks_journey`, read-only). `not_configured` when no reader is wired; a database outage is `unavailable`,
   * never an empty result. Zero rows (`rows: []`) means the student has not started that part of Career Quest.
   */
  getQuestProfile(studentId: string): Promise<PathlynksResult>;
  getQuestGoals(studentId: string): Promise<PathlynksResult>;
  getQuestPlan(studentId: string): Promise<PathlynksResult>;
  /** Last privilege-check outcome (recorded, not secret). */
  getStatus(): { privilegeCheck: "unchecked" | "ok" | "failed" | "error"; lastCause?: UnavailableCause };
}

export type PathlynksEvent =
  | { type: "privileged_role_override" }
  | { type: "privilege_check_failed" }
  | { type: "privilege_check_error" }
  | { type: "unavailable"; cause: UnavailableCause };

export interface PathlynksPortConfig {
  /** `tables` of the postgres source in config/sources.json. */
  allowedTables: readonly string[];
  /** Explicit read-model tables, including every joined table. No name inference. */
  tables: {
    profile: string; savedCareers: string; compareList: string; assessment: string; userGrade: string; grade: string; careerOption: string;
    /** T-057 optional read model: fit scores, traits and the Combined Report. A missing table answers `unsupported`, never a guess. */
    categoryFit?: string; categoryOption?: string; subcategoryFit?: string; subcategoryOption?: string; traitScores?: string; combinedReport?: string;
  };
  /** Non-secret connection fields of the postgres source; the password is read from env[passwordRef]. */
  connection?: PgConnectionConfig;
  credentialBinding?: PgCredentialBinding;
  env?: Record<string, string | undefined>;
  /** Test seam: replaces the pg connection. */
  connect?: ConnectFn;
  queryTimeoutMs?: number;
  onEvent?: (event: PathlynksEvent) => void;
  /**
   * G1 (answered 2026-10-26): the Pathlynks pool user (pathlynksadm) may hold write privileges. True skips ONLY the connect-time write-privilege refusal;
   * SELECT-only SQL, the read-only transaction and the statement timeout stay. Default false. Absent = the env var PATHLYNKS_ALLOW_PRIVILEGED_ROLE === "1".
   */
  allowPrivilegedRole?: boolean;
  /**
   * D-134: opens the READ-ONLY Career Quest database handle (`pathlynks_journey`). Absent = the Career Quest reads answer `not_configured`.
   * The port calls nothing on the handle except `collection(name).find / .aggregate / .countDocuments`, through `createQuestReader`.
   */
  questDb?: () => Promise<QuestDbLike>;
}

class PortFailure extends Error {
  constructor(readonly cause_: UnavailableCause) {
    super(cause_);
  }
}

function withDeadline<T>(p: Promise<T>, ms: number, cause: UnavailableCause): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PortFailure("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof PortFailure ? e : new PortFailure(cause));
      },
    );
  });
}

export function createPathlynksPort(config: PathlynksPortConfig): PathlynksPort {
  const allow = new Set(config.allowedTables);
  if (allow.size === 0) throw new Error("pathlynks port: the table allow-list is empty");
  for (const t of allow) {
    if (!IDENTIFIER_PATTERN.test(t)) throw new Error("pathlynks port: allow-listed table is not a plain identifier");
  }
  const t = config.tables;
  const optional = [t.categoryFit, t.categoryOption, t.subcategoryFit, t.subcategoryOption, t.traitScores, t.combinedReport].filter((n): n is string => n !== undefined);
  const mapped = [t.profile, t.savedCareers, t.compareList, t.assessment, t.userGrade, t.grade, t.careerOption, ...optional];
  for (const name of mapped) {
    if (!allow.has(name)) throw new Error("pathlynks port: a configured table is not in the allow-list");
  }
  // Pre-built, fully static statements. The only interpolated text is an allow-listed, validated identifier.
  const owner = "u.id = $1 AND u.deleted_at IS NULL AND u.disabled_at IS NULL";
  const sql = {
    profile: `SELECT NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS name, g.name AS grade
FROM "${t.profile}" u
LEFT JOIN LATERAL (SELECT ug.grade_id FROM "${t.userGrade}" ug
  WHERE ug.user_id = u.id AND ug.grade_status = 'active' ORDER BY ug.id DESC LIMIT 1) ug ON TRUE
LEFT JOIN "${t.grade}" g ON g.id = ug.grade_id
WHERE ${owner} LIMIT 1`,
    savedCareers: `SELECT co.preferred_label AS career FROM "${t.profile}" u
JOIN "${t.savedCareers}" sc ON sc.student_id = u.id
JOIN "${t.careerOption}" co ON sc.id = co.id AND sc.save_type = 'CAREER'
WHERE ${owner} ORDER BY co.preferred_label, sc.id LIMIT ${ROW_CAP + 1}`,
    compareList: `SELECT co.preferred_label AS career FROM "${t.profile}" u
JOIN "${t.compareList}" cc ON cc.student_id = u.id
JOIN "${t.careerOption}" co ON cc.career_id = co.id
WHERE ${owner} ORDER BY cc.slot, cc.career_id LIMIT ${ROW_CAP + 1}`,
    // Submitted-assessment history only: latest retry per assessment, never status=1 or an assigned-paper count.
    // The report body never crosses the SQL projection: only its presence is counted.
    assessment: `SELECT COUNT(*) FILTER (WHERE latest.is_draft_saved IS FALSE)::integer AS completed,
COUNT(*) FILTER (WHERE latest.is_draft_saved IS NOT FALSE)::integer AS "inProgress",
COUNT(*) FILTER (WHERE latest.has_report)::integer AS "reportsAvailable",
COUNT(*)::integer AS "totalResponses",
CASE WHEN COUNT(*) = 0 THEN 'none'
  WHEN COUNT(*) FILTER (WHERE latest.is_draft_saved IS FALSE) = COUNT(*) THEN 'completed'
  ELSE 'in_progress' END AS status
FROM (SELECT DISTINCT ON (ar.assessment_id) ar.assessment_id, ar.is_draft_saved,
  ar.detailed_report IS NOT NULL AS has_report
  FROM "${t.assessment}" ar JOIN "${t.profile}" u ON ar.student_id = u.id
  WHERE ${owner}
  ORDER BY ar.assessment_id, ar.modified_date DESC NULLS LAST, ar.id DESC) latest`,
    // T-057: only the latest fit-score calculation counts; one row per category / subcategory / trait.
    categoryFits: t.categoryFit && t.categoryOption ? `SELECT 'pathlynks' AS source, 'user_category_fitscore' AS "sourceTable", x.category, x."fitScore", x.surity FROM (
  SELECT DISTINCT ON (f.category_id) co.name AS category, f.fit_score AS "fitScore", f.surity_score AS surity
  FROM "${t.categoryFit}" f JOIN "${t.profile}" u ON u.id = f.user_id JOIN "${t.categoryOption}" co ON co.id = f.category_id
  WHERE ${owner} AND f.calculation_id = (SELECT MAX(f2.calculation_id) FROM "${t.categoryFit}" f2 WHERE f2.user_id = u.id)
  ORDER BY f.category_id, f.created_at DESC NULLS LAST, f.id DESC) x
ORDER BY x."fitScore" DESC NULLS LAST, x.category LIMIT ${ROW_CAP + 1}` : undefined,
    careerFits: t.subcategoryFit && t.subcategoryOption ? `SELECT 'pathlynks' AS source, 'user_subcategory_fitscore' AS "sourceTable", x.subcategory, x."fitScore",
ARRAY(SELECT left(co.preferred_label, 160) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(x.top_career_ids) = 'array' THEN x.top_career_ids ELSE '[]'::jsonb END)
  WITH ORDINALITY e(v, n) JOIN "${t.careerOption}" co ON co.id::text = e.v ORDER BY e.n LIMIT 5) AS "topCareers" FROM (
  SELECT DISTINCT ON (f.subcategory_id) so.name AS subcategory, f.fit_score AS "fitScore", f.top_career_ids
  FROM "${t.subcategoryFit}" f JOIN "${t.profile}" u ON u.id = f.user_id JOIN "${t.subcategoryOption}" so ON so.id = f.subcategory_id
  WHERE ${owner} AND f.calculation_id = (SELECT MAX(f2.calculation_id) FROM "${t.subcategoryFit}" f2 WHERE f2.user_id = u.id)
  ORDER BY f.subcategory_id, f.created_at DESC NULLS LAST, f.id DESC) x
ORDER BY x."fitScore" DESC NULLS LAST, x.subcategory LIMIT ${ROW_CAP + 1}` : undefined,
    traitScores: t.traitScores ? `SELECT 'pathlynks' AS source, 'student_trait_score_point' AS "sourceTable", x.trait, x.module, x.level, x.score FROM (
  SELECT DISTINCT ON (p.trait_key) left(COALESCE(NULLIF(TRIM(p.trait_name_raw), ''), p.trait_key), 120) AS trait, p.module_key AS module, p.level, p.normalised_score AS score
  FROM "${t.traitScores}" p JOIN "${t.profile}" u ON u.id = p.student_id
  WHERE ${owner} AND p.excluded IS NOT TRUE
  ORDER BY p.trait_key, p.taken_on DESC NULLS LAST, p.id DESC) x
ORDER BY x.score DESC NULLS LAST, x.trait LIMIT ${ROW_CAP + 1}` : undefined,
    // The report body never crosses the projection: four bounded overview fields only.
    combinedReport: t.combinedReport ? `SELECT 'pathlynks' AS source, 'combined_report_llm_data' AS "sourceTable",
left(r.response_json #>> '{profile_overview,summary}', 1500) AS summary,
${jsonbTexts("r.response_json #> '{profile_overview,strengths}'", 8, 200)} AS strengths,
${jsonbTexts("r.response_json #> '{profile_overview,areas_to_grow}'", 8, 200)} AS "areasToGrow",
left(r.response_json #>> '{static_content,recommendation}', 600) AS recommendation, r.created_at AS "generatedAt"
FROM "${t.combinedReport}" r JOIN "${t.profile}" u ON u.id = r.student_id
WHERE ${owner} AND r.status IS TRUE
ORDER BY r.report_sequence DESC NULLS LAST, r.language_id ASC NULLS LAST, r.created_at DESC NULLS LAST, r.id DESC LIMIT 1` : undefined,
  };
  const configured = [...new Set(mapped)];
  const allowPrivileged = config.allowPrivilegedRole ?? (config.env ?? process.env).PATHLYNKS_ALLOW_PRIVILEGED_ROLE === "1";
  const { read, getStatus } = createReadExecutor(config, configured, allowPrivileged);

  return {
    getStudentProfile: (id) => read(sql.profile, id),
    getSavedCareers: (id) => read(sql.savedCareers, id),
    getCompareList: (id) => read(sql.compareList, id),
    getAssessmentStatus: (id) => read(sql.assessment, id),
    getCategoryFits: (id) => optionalRead(read, sql.categoryFits, id),
    getCareerFits: (id) => optionalRead(read, sql.careerFits, id),
    getTraitScores: (id) => optionalRead(read, sql.traitScores, id),
    getCombinedReportSummary: (id) => optionalRead(read, sql.combinedReport, id, 1),
    getQuestProfile: (id) => questRead(config, id, (q) => readQuestProfile(q, id)),
    getQuestGoals: (id) => questRead(config, id, (q) => readQuestGoals(q, id)),
    getQuestPlan: (id) => questRead(config, id, (q) => readQuestPlan(q, id)),
    getStatus,
  };
}

type ReadFn = (statement: string, studentId: string, rowCap?: number) => Promise<PathlynksResult>;
/** An unconfigured optional read model is `unsupported` and opens no connection. */
function optionalRead(read: ReadFn, statement: string | undefined, studentId: string, rowCap?: number): Promise<PathlynksResult> {
  return statement === undefined ? Promise.resolve({ ok: false, reason: "unavailable", cause: "unsupported" }) : read(statement, studentId, rowCap);
}

/**
 * A bounded text[] from a jsonb array expression: strings and numbers as text, objects ONLY by name/title/label/trait/category (never their raw JSON, which
 * could carry ids or internal keys); anything else is dropped. At most `max` items of `chars` characters.
 */
function jsonbTexts(expr: string, max: number, chars: number): string {
  return `ARRAY(SELECT left(x.t, ${chars}) FROM (SELECT e.n, CASE jsonb_typeof(e.v) WHEN 'string' THEN e.v #>> '{}' WHEN 'number' THEN e.v #>> '{}'
  WHEN 'object' THEN COALESCE(e.v ->> 'name', e.v ->> 'title', e.v ->> 'label', e.v ->> 'trait', e.v ->> 'category') END AS t FROM jsonb_array_elements(
  CASE WHEN jsonb_typeof(${expr}) = 'array' THEN ${expr} ELSE '[]'::jsonb END) WITH ORDINALITY e(v, n)) x WHERE x.t IS NOT NULL ORDER BY x.n LIMIT ${max})`;
}

/** A bounded text[] of "key: value" from a json/jsonb OBJECT's top-level string/number values only (never raw JSON). */
function jsonbScalarPairs(expr: string, max: number): string {
  return `ARRAY(SELECT left(replace(kv.key, '_', ' '), 40) || ': ' || left(kv.value #>> '{}', 120) FROM jsonb_each(
  CASE WHEN jsonb_typeof(to_jsonb(${expr})) = 'object' THEN to_jsonb(${expr}) ELSE '{}'::jsonb END) kv
  WHERE jsonb_typeof(kv.value) IN ('string', 'number') ORDER BY kv.key LIMIT ${max})`;
}

// ---------------------------------------------------------------------------
// D-134 Career Quest reader (Mongo database `pathlynks_journey`). READ-ONLY by construction:
//  - `createQuestReader` wraps the handle in an object with exactly three methods (find / aggregate / count); no write method is reachable from this file.
//  - The owner filter `{ studentId }` is applied by the reader itself (the mongo twin of `u.id = $1`); callers pass the id, never a filter on it.
//  - Collections come from a closed list; reads carry maxTimeMS 3000, readPreference secondaryPreferred and a limit; aggregation stages are screened.
//  - Every read projects an allow-list of fields. reflection, description, proof_*, shareToken, factualAnswers, persona graph and AI session content are
//    never requested and never mapped, so they cannot cross even if the stored document grows a field.
// ---------------------------------------------------------------------------
export const QUEST_DB_NAME = "pathlynks_journey";
export const QUEST_COLLECTIONS = ["pathlynks_quest_profiles", "pathlynks_goals", "pathlynks_activities", "pathlynks_skill_activities"] as const;
export type QuestCollectionName = (typeof QUEST_COLLECTIONS)[number];
export const QUEST_MAX_TIME_MS = 3000;
export const QUEST_READ_PREFERENCE = "secondaryPreferred";

export interface QuestCursorLike { toArray(): Promise<Record<string, unknown>[]> }
/** The subset of a driver collection the reader may touch. Tests pass a fake that also has write methods, to prove they are never called. */
export interface QuestCollectionLike {
  find(filter: Record<string, unknown>, options?: Record<string, unknown>): QuestCursorLike;
  aggregate(pipeline: Record<string, unknown>[], options?: Record<string, unknown>): QuestCursorLike;
  countDocuments(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<number>;
}
export interface QuestDbLike { collection(name: string): QuestCollectionLike }

export interface QuestReader {
  find(collection: QuestCollectionName, studentId: string, opts: { projection: Record<string, 1>; where?: Record<string, unknown>; sort?: Record<string, 1 | -1>; limit: number }): Promise<Record<string, unknown>[]>;
  aggregate(collection: QuestCollectionName, studentId: string, stages: Record<string, unknown>[]): Promise<Record<string, unknown>[]>;
  count(collection: QuestCollectionName, studentId: string): Promise<number>;
}

const QUEST_FORBIDDEN_STAGES = /^\$(out|merge|lookup|graphLookup|unionWith|function|accumulator|where|set|addFields|replaceRoot|replaceWith)$/;

export function createQuestReader(db: QuestDbLike): QuestReader {
  const coll = (name: QuestCollectionName): QuestCollectionLike => {
    if (!(QUEST_COLLECTIONS as readonly string[]).includes(name)) throw new PortFailure("query_error");
    return db.collection(name);
  };
  const base = { maxTimeMS: QUEST_MAX_TIME_MS, readPreference: QUEST_READ_PREFERENCE };
  const reader: QuestReader = {
    async find(collection, studentId, o) {
      // `where` can narrow the owner's rows but never replaces the owner: studentId is spread last.
      const cursor = coll(collection).find({ ...(o.where ?? {}), studentId }, { ...base, projection: { _id: 0, ...o.projection }, ...(o.sort ? { sort: o.sort } : {}), limit: Math.min(o.limit, ROW_CAP + 1) });
      return cursor.toArray();
    },
    async aggregate(collection, studentId, stages) {
      for (const stage of stages) {
        const keys = Object.keys(stage);
        if (keys.length !== 1 || QUEST_FORBIDDEN_STAGES.test(keys[0]!)) throw new PortFailure("query_error");
      }
      return coll(collection).aggregate([{ $match: { studentId } }, ...stages, { $limit: ROW_CAP + 1 }], base).toArray();
    },
    async count(collection, studentId) {
      return coll(collection).countDocuments({ studentId }, base);
    },
  };
  return Object.freeze(reader);
}

async function questRead(config: Pick<PathlynksPortConfig, "questDb" | "queryTimeoutMs" | "onEvent">, studentId: string, run: (q: QuestReader) => Promise<PathlynksRow[]>): Promise<PathlynksResult> {
  if (typeof studentId !== "string" || !STUDENT_ID_PATTERN.test(studentId)) return { ok: false, reason: "refused", cause: "invalid_student_id" };
  const ms = config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  const fail = (cause: UnavailableCause): PathlynksResult => {
    try { config.onEvent?.({ type: "unavailable", cause }); } catch { /* an observer must never break a turn */ }
    return { ok: false, reason: "unavailable", cause };
  };
  if (!config.questDb) return fail("not_configured");
  try {
    const db = await withDeadline(config.questDb(), ms, "connect_error");
    const rows = await withDeadline(run(createQuestReader(db)), ms, "query_error");
    return { ok: true, rows: rows.slice(0, ROW_CAP), truncated: rows.length > ROW_CAP };
  } catch (e) {
    return fail(e instanceof PortFailure ? e.cause_ : "query_error");
  }
}

const qStr = (v: unknown, max = 160): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : undefined);
const qNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const qObj = (v: unknown): Record<string, unknown> | undefined => (typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) ? (v as Record<string, unknown>) : undefined);
const qDay = (v: unknown): string | undefined => {
  const d = v instanceof Date ? v : typeof v === "string" ? new Date(v) : undefined;
  return d && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
};
const dropUndefined = (o: Record<string, unknown>): PathlynksRow => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

const QUEST_ISLANDS = [["knowYourself", "islandKnowYourself"], ["profileBuilding", "islandProfileBuilding"], ["careerSelection", "islandCareerSelection"], ["universitySelection", "islandUniversitySelection"]] as const;
const QUEST_PROFILE_PROJECTION: Record<string, 1> = {
  gradeLabel: 1, board: 1, "avatarState.level": 1, "avatarState.xp": 1,
  ...(Object.fromEntries(QUEST_ISLANDS.flatMap(([k]) => [`islandStates.${k}.completed`, `islandStates.${k}.unlocked`, `islandStates.${k}.progressPct`].map((p) => [p, 1]))) as Record<string, 1>),
  "selectedCareer.category": 1, "allCareerPicks.rank": 1, "targetUniversity.name": 1,
};
function islandState(v: unknown): string {
  const i = qObj(v);
  if (!i) return "locked";
  if (i.completed === true) return "completed";
  if (i.unlocked !== true) return "locked";
  const pct = qNum(i.progressPct);
  return pct !== undefined && pct > 0 ? `in progress (${Math.round(pct)}%)` : "unlocked";
}
async function readQuestProfile(q: QuestReader, studentId: string): Promise<PathlynksRow[]> {
  const docs = await q.find("pathlynks_quest_profiles", studentId, { projection: QUEST_PROFILE_PROJECTION, limit: 1 });
  return docs.slice(0, 1).map((d) => {
    const avatar = qObj(d.avatarState);
    const islands = qObj(d.islandStates);
    return dropUndefined({
      gradeLabel: qStr(d.gradeLabel, 40), board: qStr(d.board, 40), level: qNum(avatar?.level), xp: qNum(avatar?.xp),
      ...Object.fromEntries(QUEST_ISLANDS.map(([k, out]) => [out, islandState(islands?.[k])])),
      selectedCareer: qStr(qObj(d.selectedCareer)?.category), picksCount: Array.isArray(d.allCareerPicks) ? Math.min(d.allCareerPicks.length, 5) : 0,
      targetUniversity: qStr(qObj(d.targetUniversity)?.name, 200),
    });
  });
}

async function readQuestGoals(q: QuestReader, studentId: string): Promise<PathlynksRow[]> {
  const docs = await q.find("pathlynks_goals", studentId, { projection: { title: 1, status: 1, targetDate: 1 }, where: { status: { $ne: "archived" } }, sort: { targetDate: 1 }, limit: ROW_CAP + 1 });
  return docs.map((d) => dropUndefined({ title: qStr(d.title, 160), status: qStr(d.status, 40), due: qDay(d.targetDate) })).filter((r) => r.title !== undefined);
}

async function readQuestPlan(q: QuestReader, studentId: string): Promise<PathlynksRow[]> {
  const [profiles, byType, skill] = await Promise.all([
    q.find("pathlynks_quest_profiles", studentId, { projection: { "yearPlan.planTitle": 1, "yearPlan.level": 1, "yearPlan.completedStepTitles": 1, "yearPlan.areas.area": 1, "yearPlan.areas.status": 1, "yearPlan.areas.activities.step": 1, "yearPlan.areas.activities.title": 1 }, limit: 1 }),
    q.aggregate("pathlynks_activities", studentId, [{ $group: { _id: "$type", n: { $sum: 1 }, verified: { $sum: { $cond: [{ $eq: ["$verified", true] }, 1, 0] } } } }]),
    q.count("pathlynks_skill_activities", studentId),
  ]);
  const plan = qObj(profiles[0]?.yearPlan);
  const areas = Array.isArray(plan?.areas) ? plan.areas.map(qObj).filter((a): a is Record<string, unknown> => a !== undefined) : [];
  const completed = new Set(Array.isArray(plan?.completedStepTitles) ? plan.completedStepTitles.map((t) => qStr(t, 200)).filter((t): t is string => t !== undefined) : []);
  const steps = areas.flatMap((a) => (Array.isArray(a.activities)
    ? a.activities.map(qObj).filter((x): x is Record<string, unknown> => x !== undefined).sort((x, y) => (qNum(x.step) ?? 0) - (qNum(y.step) ?? 0)).map((x) => ({ area: qStr(a.area, 80), title: qStr(x.title, 200) }))
    : [])).filter((x): x is { area: string | undefined; title: string } => x.title !== undefined);
  const next = steps.find((x) => !completed.has(x.title));
  const statuses = new Map<string, number>();
  for (const a of areas) { const st = qStr(a.status, 40) ?? "unknown"; statuses.set(st, (statuses.get(st) ?? 0) + 1); }
  const types = byType.map((g) => ({ type: qStr(g._id, 40) ?? "other", n: qNum(g.n) ?? 0, verified: qNum(g.verified) ?? 0 }));
  const logged = types.reduce((n, t) => n + t.n, 0);
  if (!plan && logged === 0 && skill === 0) return [];
  return [dropUndefined({
    planTitle: qStr(plan?.planTitle), planLevel: qNum(plan?.level), areasTotal: areas.length,
    areaStatuses: statuses.size ? [...statuses].map(([k, n]) => `${k} ${n}`).join(", ") : undefined,
    stepsTotal: steps.length, stepsCompleted: steps.filter((x) => completed.has(x.title)).length,
    nextArea: next?.area, nextStep: next?.title,
    activitiesLogged: logged, activitiesVerified: types.reduce((n, t) => n + t.verified, 0),
    activitiesByType: types.length ? types.map((t) => `${t.type} ${t.n}`).join(", ") : undefined, skillActivities: skill,
  })];
}

/** Shared bounded SELECT runner. SQL is private and supplied only by the two fixed read models below. */
function createReadExecutor(
  config: Pick<PathlynksPortConfig, "connection" | "credentialBinding" | "env" | "connect" | "queryTimeoutMs" | "onEvent">,
  configured: readonly string[],
  allowPrivileged: boolean,
  studentIdPattern = STUDENT_ID_PATTERN,
  requiredPlatform?: "vidysea",
) {
  const queryTimeoutMs = config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  const emit = (e: PathlynksEvent): void => {
    try {
      config.onEvent?.(e);
    } catch {
      /* an observer must never break a turn */
    }
  };
  const status: ReturnType<PathlynksPort["getStatus"]> = { privilegeCheck: "unchecked" };
  // The override is a startup fact, announced once with no secret: the operator sees that the guard is off by choice.
  if (allowPrivileged) emit({ type: "privileged_role_override" });

  async function open(): Promise<PgClientLike> {
    if (config.connect) return config.connect();
    if (!config.connection) throw new PortFailure("not_configured");
    if (requiredPlatform && (config.credentialBinding?.platform !== requiredPlatform || !/^VIDYSEA_DB_[A-Z0-9_]+$/.test(config.connection.passwordRef))) throw new PortFailure("not_configured");
    const pg = buildPgConfig(config.connection, config.env ?? process.env, config.credentialBinding);
    if (!pg) throw new PortFailure("not_configured");
    return defaultConnect(pg);
  }

  async function verifyReadOnly(client: PgClientLike): Promise<void> {
    if (allowPrivileged) return; // G1 override: the read-only transaction (SET default_transaction_read_only = on) and SELECT-only SQL still hold.
    for (const table of configured) {
      let row: Record<string, unknown> | undefined;
      try {
        const res = await withDeadline(
          client.query(
            "SELECT has_table_privilege(current_user, $1, 'INSERT') AS ins, has_table_privilege(current_user, $1, 'UPDATE') AS upd, has_table_privilege(current_user, $1, 'DELETE') AS del",
            [table],
          ),
          queryTimeoutMs,
          "privilege_check_error",
        );
        row = res.rows[0];
      } catch {
        status.privilegeCheck = "error";
        status.lastCause = "privilege_check_error";
        emit({ type: "privilege_check_error" });
        throw new PortFailure("privilege_check_error");
      }
      if (!row || typeof row.ins !== "boolean" || typeof row.upd !== "boolean" || typeof row.del !== "boolean") {
        status.privilegeCheck = "error";
        status.lastCause = "privilege_check_error";
        emit({ type: "privilege_check_error" });
        throw new PortFailure("privilege_check_error");
      }
      if (row.ins || row.upd || row.del) {
        status.privilegeCheck = "failed";
        status.lastCause = "privilege_check_failed";
        emit({ type: "privilege_check_failed" });
        throw new PortFailure("privilege_check_failed");
      }
    }
    status.privilegeCheck = "ok";
    delete status.lastCause;
  }

  async function read(statement: string, studentId: string, rowCap = ROW_CAP): Promise<PathlynksResult> {
    if (typeof studentId !== "string" || !studentIdPattern.test(studentId)) {
      return { ok: false, reason: "refused", cause: "invalid_student_id" };
    }
    let client: PgClientLike | undefined;
    try {
      try {
        const pending = open();
        try {
          client = await withDeadline(pending, queryTimeoutMs, "connect_error");
        } catch (e) {
          // A driver that resolves after the deadline must still relinquish its connection.
          void pending.then((late) => late.end(), () => undefined).catch(() => undefined);
          throw e;
        }
      } catch (e) {
        throw e instanceof PortFailure && e.cause_ === "not_configured" ? e : new PortFailure(e instanceof PortFailure ? e.cause_ : "connect_error");
      }
      try {
        await withDeadline(client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`), queryTimeoutMs, "query_error");
        await withDeadline(client.query("SET default_transaction_read_only = on"), queryTimeoutMs, "query_error");
      } catch (e) {
        throw new PortFailure(e instanceof PortFailure ? e.cause_ : "query_error");
      }
      await verifyReadOnly(client);
      const res = await withDeadline(client.query(statement, [studentId]), queryTimeoutMs, "query_error");
      const rows = res.rows.slice(0, rowCap);
      return { ok: true, rows, truncated: res.rows.length > rowCap };
    } catch (e) {
      const cause: UnavailableCause = e instanceof PortFailure ? e.cause_ : "query_error";
      emit({ type: "unavailable", cause });
      return { ok: false, reason: "unavailable", cause };
    } finally {
      if (client) {
        try {
          await withDeadline(client.end(), 1000, "query_error");
        } catch {
          /* a failed close must not surface */
        }
      }
    }
  }

  return { read, getStatus: () => ({ ...status }) };
}

export interface VidyseaPortConfig extends Pick<PathlynksPortConfig, "allowedTables" | "connection" | "credentialBinding" | "env" | "connect" | "queryTimeoutMs" | "onEvent"> {
  /** T-057 optional `snapshot`: the Pathlynks SSO snapshot Vidysea stores per linked student (`pathlynks_student_snapshot`). */
  tables: {
    profile: string; student: string; shortlist: string; assessment: string; snapshot?: string;
    /**
     * Tool-first S7 optional read models. Each is enabled when its exact table is allow-listed (config/sources.json `vidysea-db.tables`)
     * or declared here; absent = that read answers `unsupported` and the table is neither probed nor queried. `journeyMap`,
     * `journeyPhases` and `milestones` are one read model and are all needed.
     */
    journeyMap?: string; journeyPhases?: string; milestones?: string; applications?: string; visa?: string; favourites?: string; savedScholarships?: string;
  };
  /**
   * D-123 (Umesh, 2026-10-28): the Vidysea handover user is privileged too. True skips ONLY the connect-time write-privilege refusal;
   * SELECT-only SQL, the read-only transaction and the timeouts stay. Default false. Absent = env VIDYSEA_ALLOW_PRIVILEGED_ROLE === "1".
   * Its own flag: Pathlynks G1 (PATHLYNKS_ALLOW_PRIVILEGED_ROLE) is never a Vidysea grant.
   */
  allowPrivilegedRole?: boolean;
}
export interface VidyseaPort {
  getStudentProfile(studentId: string): Promise<PathlynksResult>;
  getShortlistedProgrammes(studentId: string): Promise<PathlynksResult>;
  /** Saved AI profile classifications, never psychometric completion or career ranking. */
  getProfileAssessment(studentId: string): Promise<PathlynksResult>;
  /** T-057: the linked student's Pathlynks snapshot on Vidysea (grade, board, subjects, careers, university preferences). */
  getPathlynksSnapshot(studentId: string): Promise<PathlynksResult>;
  getCompareList(studentId: string): Promise<PathlynksResult>;
  /**
   * Tool-first S7 reads (required since T4). The port always provides them and answers `unsupported` when the table is not allow-listed.
   * Owner-bound, SELECT-only, 50 rows plus a `truncated` flag, fixed columns, no free text.
   */
  /** One row per active (non-archived) programme journey map: programme, university, milestone counts by status, earliest open due date. */
  getJourneyMaps(studentId: string): Promise<PathlynksResult>;
  getApplications(studentId: string): Promise<PathlynksResult>;
  getVisaApplications(studentId: string): Promise<PathlynksResult>;
  getFavourites(studentId: string): Promise<PathlynksResult>;
  getSavedScholarships(studentId: string): Promise<PathlynksResult>;
  getStatus: PathlynksPort["getStatus"];
}

const VIDYSEA_OPTIONAL_TABLES = {
  journeyMap: "user_course_journey_map", journeyPhases: "journey_phases", milestones: "milestones", applications: "applications",
  visa: "visa_applications", favourites: "user_favourites", savedScholarships: "saved_scholarships",
} as const;

/** Vidysea's declared SQLAlchemy owner model. No shortlist GET/self-heal, no inferred careers. */
export function createVidyseaPort(config: VidyseaPortConfig): VidyseaPort {
  const t = config.tables;
  const required = { profile: "users", student: "students", shortlist: "student_shortlisted_courses", assessment: "ai_profile_assessments" };
  const allow = new Set(config.allowedTables);
  if (allow.size === 0 || Object.values(required).some(name => !allow.has(name))) throw new Error("vidysea port: table allow-list incomplete");
  if ([...allow].some(name => !IDENTIFIER_PATTERN.test(name))) throw new Error("vidysea port: invalid table identifier");
  for (const key of Object.keys(required) as (keyof typeof required)[]) {
    if (t[key] !== required[key]) throw new Error("vidysea port: exact declared read model required");
  }
  if (t.snapshot !== undefined && (t.snapshot !== "pathlynks_student_snapshot" || !allow.has(t.snapshot))) throw new Error("vidysea port: exact declared read model required");
  // Pathlynks G1 is never a Vidysea grant; only Vidysea's own D-123 flag skips the probe. Otherwise every joined table is probed on every read.
  // An unbound port never connects, so it never reads the env (S12: no env lookups before a binding exists).
  const bound = config.connect !== undefined || config.credentialBinding?.platform === "vidysea";
  const allowPrivileged = config.allowPrivilegedRole ?? (bound && (config.env ?? process.env).VIDYSEA_ALLOW_PRIVILEGED_ROLE === "1");
  // Tool-first S7: each optional read model is on when its exact table is declared or allow-listed; a declared name must be the exact table and allow-listed.
  const optional: { -readonly [K in keyof typeof VIDYSEA_OPTIONAL_TABLES]?: string } = {};
  for (const key of Object.keys(VIDYSEA_OPTIONAL_TABLES) as (keyof typeof VIDYSEA_OPTIONAL_TABLES)[]) {
    const exact = VIDYSEA_OPTIONAL_TABLES[key];
    const declared = t[key];
    if (declared !== undefined && (declared !== exact || !allow.has(exact))) throw new Error("vidysea port: exact declared read model required");
    if (allow.has(exact)) optional[key] = exact;
  }
  const journeyOn = optional.journeyMap !== undefined && optional.journeyPhases !== undefined && optional.milestones !== undefined;
  const enabledOptional = [
    ...(journeyOn ? [optional.journeyMap!, optional.journeyPhases!, optional.milestones!] : []),
    ...[optional.applications, optional.visa, optional.favourites, optional.savedScholarships].filter((n): n is string => n !== undefined),
  ];
  const probed = [...Object.values(required), ...(t.snapshot ? [t.snapshot] : []), ...enabledOptional];
  const { read, getStatus } = createReadExecutor(config, probed, allowPrivileged, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "vidysea");
  const owner = "u.id = $1 AND s.deleted_at IS NULL AND u.is_active IS TRUE AND u.disabled_at IS NULL";
  const profile = `SELECT 'vidysea' AS source, 'students' AS "sourceTable", s.id AS student_id,
NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS name,
s.academic_level, s.field_of_interest, s.target_intake, s.budget_min, s.budget_max,
s.budget_currency, s.budget_range_text, s.nationality, s.updated_at,
ARRAY(SELECT left(v.value #>> '{}', 160) FROM json_array_elements(
  CASE WHEN json_typeof(s.preferred_countries) = 'array' THEN s.preferred_countries ELSE '[]'::json END
) WITH ORDINALITY v(value, n) WHERE json_typeof(v.value) = 'string' ORDER BY v.n LIMIT 20) AS preferred_countries,
ARRAY(SELECT left(v.value #>> '{}', 200) FROM json_array_elements(
  CASE WHEN json_typeof(s.preferred_courses) = 'array' THEN s.preferred_courses ELSE '[]'::json END
) WITH ORDINALITY v(value, n) WHERE json_typeof(v.value) = 'string' ORDER BY v.n LIMIT 20) AS preferred_courses
FROM "${t.student}" s JOIN "${t.profile}" u ON u.id = s.id WHERE ${owner} LIMIT 1`;
  const shortlist = `SELECT 'vidysea' AS source, 'student_shortlisted_courses' AS "sourceTable",
q.id AS item_id, q.programme_id, q.university_id, q.programme_name, q.university_name,
q.verification_status, q.is_verified, q.added_by, q.programme_priority,
q.student_decision AS stored_student_decision, q.is_finalized, q.application_started, q.created_at, q.updated_at
FROM "${t.shortlist}" q JOIN "${t.student}" s ON s.id = q.student_id
JOIN "${t.profile}" u ON u.id = s.id WHERE ${owner} AND q.deleted_at IS NULL
ORDER BY q.created_at DESC, q.id DESC LIMIT 51`;
  const assessment = `SELECT 'vidysea' AS source, 'ai_profile_assessments' AS "sourceTable",
'profile_classification' AS kind, a.academic_strength, a.english_proficiency, a.work_experience,
a.financial_capability, a.previous_visa_history, a.preferred_intake, a.updated_at
FROM "${t.assessment}" a JOIN "${t.student}" s ON s.id = a.student_id
JOIN "${t.profile}" u ON u.id = s.id WHERE ${owner} LIMIT 1`;
  const snapshot = t.snapshot ? `SELECT 'vidysea' AS source, 'pathlynks_student_snapshot' AS "sourceTable",
p.grade_label AS grade, p.board, ${jsonbTexts("p.subjects_json -> 'subjects'", 20, 120)} AS subjects,
left(p.selected_career_name, 160) AS "selectedCareer",
${jsonbTexts("p.career_picks_json -> 'recommended'", 10, 160)} AS "recommendedCareers",
${jsonbTexts("p.career_picks_json -> 'all_picks'", 10, 160)} AS "careerPicks",
left(p.target_university_name, 200) AS "targetUniversity", left(p.target_university_location, 200) AS "targetUniversityLocation",
${jsonbScalarPairs("p.university_preferences_json", 8)} AS "universityPreferences", p.synced_at AS "syncedAt"
FROM "${t.snapshot}" p JOIN "${t.profile}" u ON u.id = p.vidysea_user_id JOIN "${t.student}" s ON s.id = u.id
WHERE ${owner} ORDER BY p.synced_at DESC NULLS LAST, p.updated_at DESC NULLS LAST LIMIT 1` : undefined;
  // Tool-first S7. Same owner predicate and join shape as the shortlist read; ids bound as $1 only; fixed column lists; no free-text column
  // (journey milestone names/notes, application notes and offer URLs, visa checklist/comments, favourite notes, scholarship raw/link/summary/status_notes).
  // Status literals ('Not Started', 'In Progress', 'Completed') are the backend model values; the live G-probe (t2-live.md) also found 'Pending', counted in its own bucket.
  const journeyMaps = journeyOn ? `SELECT 'vidysea' AS source, 'user_course_journey_map' AS "sourceTable",
j.id AS item_id, j.program_name, j.university_name, j.country_name, j.offer_status, j.created_at, j.updated_at,
COALESCE(agg.phases_total, 0) AS phases_total, COALESCE(agg.milestones_total, 0) AS milestones_total,
COALESCE(agg.milestones_completed, 0) AS milestones_completed, COALESCE(agg.milestones_in_progress, 0) AS milestones_in_progress,
COALESCE(agg.milestones_not_started, 0) AS milestones_not_started, COALESCE(agg.milestones_pending, 0) AS milestones_pending, agg.next_due_date
FROM "${t.student}" s JOIN "${t.profile}" u ON u.id = s.id
JOIN "${optional.journeyMap}" j ON j.user_id = s.id
LEFT JOIN LATERAL (SELECT COUNT(DISTINCT p.id)::integer AS phases_total, COUNT(m.id)::integer AS milestones_total,
  COUNT(m.id) FILTER (WHERE m.status = 'Completed')::integer AS milestones_completed,
  COUNT(m.id) FILTER (WHERE m.status = 'In Progress')::integer AS milestones_in_progress,
  COUNT(m.id) FILTER (WHERE m.status = 'Not Started')::integer AS milestones_not_started,
  COUNT(m.id) FILTER (WHERE m.status = 'Pending')::integer AS milestones_pending,
  MIN(m.end_date) FILTER (WHERE m.status IS DISTINCT FROM 'Completed' AND m.end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date) AS next_due_date
  FROM "${optional.journeyPhases}" p LEFT JOIN "${optional.milestones}" m ON m.journey_phase_id = p.id AND m.removed_at IS NULL
  WHERE p.user_course_journey_map_id = j.id) agg ON TRUE
WHERE ${owner} AND j.archived_at IS NULL
ORDER BY j.updated_at DESC NULLS LAST, j.id DESC LIMIT 51` : undefined;
  const applications = optional.applications ? `SELECT 'vidysea' AS source, 'applications' AS "sourceTable",
a.id AS item_id, a.university_name, a.program_name, a.application_status, a.application_deadline, a.submission_date, a.created_at
FROM "${t.student}" s JOIN "${t.profile}" u ON u.id = s.id
JOIN "${optional.applications}" a ON s.id = a.student_id
WHERE ${owner} AND a.deleted_at IS NULL
ORDER BY a.created_at DESC, a.id DESC LIMIT 51` : undefined;
  const visa = optional.visa ? `SELECT 'vidysea' AS source, 'visa_applications' AS "sourceTable",
v.visa_type, v.country, v.status, v.interview_date, v.biometrics_status, v.visa_fee_status, v.created_at
FROM "${t.student}" s JOIN "${t.profile}" u ON u.id = s.id
JOIN "${optional.visa}" v ON s.id = v.student_id
WHERE ${owner}
ORDER BY v.created_at DESC, v.id DESC LIMIT 51` : undefined;
  const favourites = optional.favourites ? `SELECT 'vidysea' AS source, 'user_favourites' AS "sourceTable",
f.item_type, f.item_name, f.university_name, f.created_at
FROM "${t.student}" s JOIN "${t.profile}" u ON u.id = s.id
JOIN "${optional.favourites}" f ON f.user_id = u.id
WHERE ${owner}
ORDER BY f.created_at DESC, f.id DESC LIMIT 51` : undefined;
  const savedScholarships = optional.savedScholarships ? `SELECT 'vidysea' AS source, 'saved_scholarships' AS "sourceTable",
c.name, c.provider, c.country, c.amount, c.deadline, c.status, c.applied_at, c.result_at, c.created_at
FROM "${t.student}" s JOIN "${t.profile}" u ON u.id = s.id
JOIN "${optional.savedScholarships}" c ON c.student_id = u.id
WHERE ${owner}
ORDER BY c.created_at DESC, c.id DESC LIMIT 51` : undefined;
  return {
    getStudentProfile: id => read(profile, id, 1),
    getShortlistedProgrammes: id => read(shortlist, id, 50),
    getProfileAssessment: id => read(assessment, id, 1),
    getPathlynksSnapshot: id => optionalRead(read, snapshot, id, 1),
    getJourneyMaps: id => optionalRead(read, journeyMaps, id),
    getApplications: id => optionalRead(read, applications, id),
    getVisaApplications: id => optionalRead(read, visa, id),
    getFavourites: id => optionalRead(read, favourites, id),
    getSavedScholarships: id => optionalRead(read, savedScholarships, id),
    getCompareList: async () => ({ ok: false, reason: "unavailable", cause: "unsupported" }),
    getStatus,
  };
}

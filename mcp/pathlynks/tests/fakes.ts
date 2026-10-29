import type { PgClientLike, ConnectFn } from "../src/index.js";

export interface Captured {
  text: string;
  values: readonly unknown[] | undefined;
}

export interface FakeOptions {
  /** Privilege flags per table; default all false. */
  privileges?: Record<string, { INSERT?: boolean; UPDATE?: boolean; DELETE?: boolean }>;
  /** Rows returned by a data SELECT. */
  rows?: Record<string, unknown>[] | ((text: string, values: readonly unknown[]) => Record<string, unknown>[]);
  failConnect?: Error;
  failPrivilege?: Error;
  /** privilege probe returns an empty result set */
  emptyPrivilege?: boolean;
  failSelect?: Error;
  hangSelect?: boolean;
  failSet?: Error;
}

export interface FakeHarness {
  statements: Captured[];
  connects: number;
  ends: number;
  connect: ConnectFn;
}

export function createFakePg(opts: FakeOptions = {}): FakeHarness {
  const h: FakeHarness = { statements: [], connects: 0, ends: 0, connect: undefined as unknown as ConnectFn };
  h.connect = async () => {
    h.connects += 1;
    if (opts.failConnect) throw opts.failConnect;
    const client: PgClientLike = {
      async query(text: string, values?: readonly unknown[]) {
        h.statements.push({ text, values });
        if (/^SET\b/i.test(text)) {
          if (opts.failSet) throw opts.failSet;
          return { rows: [] };
        }
        if (/has_table_privilege/i.test(text)) {
          if (opts.failPrivilege) throw opts.failPrivilege;
          if (opts.emptyPrivilege) return { rows: [] };
          const table = String(values?.[0]);
          const p = opts.privileges?.[table] ?? {};
          return { rows: [{ ins: p.INSERT === true, upd: p.UPDATE === true, del: p.DELETE === true }] };
        }
        if (opts.hangSelect) return new Promise<{ rows: Record<string, unknown>[] }>(() => undefined);
        if (opts.failSelect) throw opts.failSelect;
        const r = typeof opts.rows === "function" ? opts.rows(text, values ?? []) : (opts.rows ?? []);
        return { rows: r };
      },
      async end() {
        h.ends += 1;
      },
    };
    return client;
  };
  return h;
}

export function manyRows(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({ id: i, student_id: "s-1" }));
}


/** Same-column-shape relational fixture oracle, not a PostgreSQL interpreter. SQL structure is asserted separately. */
export interface PathlynksFixture {
  users: Record<string, unknown>[];
  user_grade: Record<string, unknown>[];
  grade: Record<string, unknown>[];
  student_saved_careers: Record<string, unknown>[];
  student_career_compare: Record<string, unknown>[];
  career_option: Record<string, unknown>[];
  assessment_response: Record<string, unknown>[];
}

export const REAL_TABLES = {
  profile: "users", savedCareers: "student_saved_careers", compareList: "student_career_compare",
  assessment: "assessment_response", userGrade: "user_grade", grade: "grade", careerOption: "career_option",
};

export function populatedFixture(): PathlynksFixture {
  return {
    users: [
      { id: "stu-A", student_id: null, first_name: "Asha", last_name: "Rao", deleted_at: null, disabled_at: null, email: "PRIVATE-EMAIL", password: "PRIVATE-PASSWORD" },
      { id: "stu-B", student_id: "legacy-B", first_name: "Other Student", deleted_at: null, disabled_at: null },
      { id: "empty", student_id: null, first_name: "Empty", deleted_at: null, disabled_at: null },
      { id: "disabled", first_name: "Disabled", disabled_at: "2026-01-01", deleted_at: null },
      { id: "deleted", first_name: "Deleted", deleted_at: "2026-01-01", disabled_at: null },
    ],
    user_grade: [
      { id: 1, user_id: "stu-A", grade_id: 10, grade_status: "active" },
      { id: 2, user_id: "stu-A", grade_id: 12, grade_status: "active" },
      { id: 3, user_id: "stu-A", grade_id: 10, grade_status: "historical" },
      { id: 4, user_id: "stu-B", grade_id: 10, grade_status: "active" },
    ],
    grade: [{ id: 10, name: "Grade10" }, { id: 12, name: "Grade12" }],
    student_saved_careers: [{ student_id: "stu-A", id: 2, save_type: "CAREER" }, { student_id: "stu-A", id: 1, save_type: "CAREER" }, { student_id: "stu-A", id: 3, save_type: "CATEGORY" }, { student_id: "stu-B", id: 3, save_type: "CAREER" }],
    student_career_compare: [{ student_id: "stu-A", career_id: 2, slot: 1 }, { student_id: "stu-A", career_id: 1, slot: 2 }, { student_id: "stu-B", career_id: 3, slot: 0 }],
    career_option: [{ id: 1, preferred_label: "Architect" }, { id: 2, preferred_label: "Pilot" }, { id: 3, preferred_label: "PRIVATE-OTHER-CAREER" }],
    assessment_response: [
      { id: 1, student_id: "stu-A", assessment_id: 1, modified_date: "2026-01-01", is_draft_saved: true, status: 1, detailed_report: null },
      { id: 2, student_id: "stu-A", assessment_id: 1, modified_date: "2026-02-01", is_draft_saved: false, status: 0, detailed_report: "PRIVATE-REPORT" },
      { id: 3, student_id: "stu-A", assessment_id: 2, modified_date: "2026-02-01", is_draft_saved: false, status: 1, detailed_report: "OLD-REPORT" },
      { id: 4, student_id: "stu-A", assessment_id: 2, modified_date: "2026-02-01", is_draft_saved: true, status: 1, detailed_report: null },
      { id: 99, student_id: "stu-A", assessment_id: 1, modified_date: null, is_draft_saved: true, status: 1, detailed_report: null },
      { id: 5, student_id: "stu-A", assessment_id: 3, modified_date: "2026-02-01", is_draft_saved: null, status: 1, detailed_report: null },
      { id: 6, student_id: "stu-B", assessment_id: 1, modified_date: "2026-03-01", is_draft_saved: false, status: 1, detailed_report: "PRIVATE-OTHER-REPORT" },
    ],
  };
}

export function createFixturePg(db = populatedFixture()): FakeHarness {
  return createFakePg({ rows: (sql, values) => {
    const owner = db.users.find(u => u.id === values[0] && u.deleted_at == null && u.disabled_at == null);
    if (/DISTINCT ON/.test(sql)) {
      const latest = new Map<unknown, Record<string, unknown>>();
      const rows = db.assessment_response.filter(r => owner && r.student_id === owner.id).sort((a, b) => {
        if (a.modified_date == null && b.modified_date != null) return 1;
        if (b.modified_date == null && a.modified_date != null) return -1;
        return String(b.modified_date ?? "").localeCompare(String(a.modified_date ?? "")) || Number(b.id) - Number(a.id);
      });
      for (const row of rows) if (!latest.has(row.assessment_id)) latest.set(row.assessment_id, row);
      const entries = [...latest.values()];
      const completed = entries.filter(r => r.is_draft_saved === false).length;
      return [{ completed, inProgress: entries.length - completed, reportsAvailable: entries.filter(r => r.detailed_report != null).length,
        totalResponses: entries.length, status: entries.length === 0 ? "none" : completed === entries.length ? "completed" : "in_progress" }];
    }
    if (!owner) return [];
    if (/JOIN "student_saved_careers"/.test(sql)) {
      return db.student_saved_careers.filter(r => r.student_id === owner.id && (!/sc\.save_type = 'CAREER'/.test(sql) || r.save_type === "CAREER"))
        .map(r => db.career_option.find(c => c.id === r.id)).filter((r): r is Record<string, unknown> => r !== undefined)
        .sort((a,b) => String(a.preferred_label).localeCompare(String(b.preferred_label)) || Number(a.id) - Number(b.id))
        .slice(0, 51).map(c => ({ career: c.preferred_label }));
    }
    if (/JOIN "student_career_compare"/.test(sql)) {
      return db.student_career_compare.filter(r => r.student_id === owner.id)
        .sort((a,b) => Number(a.slot) - Number(b.slot) || Number(a.career_id) - Number(b.career_id))
        .map(r => db.career_option.find(c => c.id === r.career_id)).filter((r): r is Record<string, unknown> => r !== undefined)
        .slice(0, 51).map(c => ({ career: c.preferred_label }));
    }
    if (/LEFT JOIN LATERAL/.test(sql)) {
      const active = db.user_grade.filter(r => r.user_id === owner.id && r.grade_status === "active").sort((a,b) => Number(b.id) - Number(a.id))[0];
      const grade = db.grade.find(g => g.id === active?.grade_id);
      return [{ name: [owner.first_name, owner.last_name].filter(v => v != null).join(" ").trim() || null, grade: grade?.name ?? null }];
    }
    throw new Error("fixture received an unrecognised read model");
  } });
}


// ---------------------------------------------------------------------------
// D-134 in-memory Career Quest Mongo fake. It evaluates only what the reader sends (owner filter, `$ne`, dotted include projections, sort, limit, the one
// $group) and records every call. Every WRITE method throws and is counted, so a test can prove none is ever reached.
// ---------------------------------------------------------------------------
export interface QuestFakeCall { collection: string; op: "find" | "aggregate" | "countDocuments"; filter?: Record<string, unknown>; pipeline?: Record<string, unknown>[]; options?: Record<string, unknown> }
export interface QuestFake {
  db: { collection(name: string): Record<string, unknown> };
  calls: QuestFakeCall[];
  writeCalls: string[];
  collectionsTouched: Set<string>;
}
const WRITE_METHODS = ["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany", "findOneAndUpdate", "findOneAndDelete", "findOneAndReplace", "bulkWrite", "drop", "createIndex", "dropIndex", "rename"];

function includePaths(value: unknown, paths: string[][]): unknown {
  if (Array.isArray(value)) return value.map((e) => includePaths(e, paths));
  if (typeof value !== "object" || value === null || value instanceof Date) return value;
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const head of new Set(paths.map((p) => p[0]!))) {
    if (src[head] === undefined) continue;
    const mine = paths.filter((p) => p[0] === head);
    out[head] = mine.some((p) => p.length === 1) ? structuredClone(src[head]) : includePaths(src[head], mine.map((p) => p.slice(1)));
  }
  return out;
}
export function fakeProject(doc: Record<string, unknown>, projection: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!projection) return structuredClone(doc);
  const paths = Object.entries(projection).filter(([, f]) => f === 1).map(([p]) => p.split("."));
  return includePaths(doc, paths) as Record<string, unknown>;
}

export function createQuestFake(data: Record<string, Record<string, unknown>[]>, opts: { failWith?: Error; hang?: boolean } = {}): QuestFake {
  const fake: QuestFake = { db: undefined as never, calls: [], writeCalls: [], collectionsTouched: new Set() };
  const matches = (d: Record<string, unknown>, filter: Record<string, unknown>): boolean => Object.entries(filter).every(([k, cond]) => {
    if (typeof cond === "object" && cond !== null && "$ne" in cond) return d[k] !== (cond as { $ne: unknown }).$ne;
    return d[k] === cond;
  });
  fake.db = {
    collection(name: string) {
      fake.collectionsTouched.add(name);
      const rows = () => data[name] ?? [];
      const guard = <T>(run: () => T): T | Promise<never> => (opts.failWith ? Promise.reject(opts.failWith) : opts.hang ? new Promise<never>(() => undefined) : run());
      const coll: Record<string, unknown> = {
        find(filter: Record<string, unknown>, options: Record<string, unknown> = {}) {
          fake.calls.push({ collection: name, op: "find", filter, options });
          return { toArray: () => guard(() => {
            let out = rows().filter((d) => matches(d, filter));
            const sort = options.sort as Record<string, 1 | -1> | undefined;
            if (sort) { const [[k, dir]] = Object.entries(sort) as [string, 1 | -1][]; out = [...out].sort((a, b) => dir * (String(a[k] ?? "").localeCompare(String(b[k] ?? "")))); }
            return out.slice(0, Number(options.limit ?? 1000)).map((d) => fakeProject(d, options.projection as Record<string, unknown>));
          }) };
        },
        aggregate(pipeline: Record<string, unknown>[], options: Record<string, unknown> = {}) {
          fake.calls.push({ collection: name, op: "aggregate", pipeline, options });
          return { toArray: () => guard(() => {
            const match = (pipeline[0] as { $match: Record<string, unknown> }).$match;
            const groupStage = pipeline.find((s) => "$group" in s) as { $group: { _id: string } } | undefined;
            const mine = rows().filter((d) => matches(d, match));
            if (!groupStage) return mine;
            const field = groupStage.$group._id.replace(/^\$/, "");
            const groups = new Map<unknown, { _id: unknown; n: number; verified: number }>();
            for (const d of mine) { const g = groups.get(d[field]) ?? { _id: d[field], n: 0, verified: 0 }; g.n += 1; if (d.verified === true) g.verified += 1; groups.set(d[field], g); }
            return [...groups.values()];
          }) };
        },
        countDocuments(filter: Record<string, unknown>, options: Record<string, unknown> = {}) {
          fake.calls.push({ collection: name, op: "countDocuments", filter, options });
          return guard(() => rows().filter((d) => matches(d, filter)).length);
        },
      };
      for (const m of WRITE_METHODS) coll[m] = () => { fake.writeCalls.push(`${name}.${m}`); throw new Error("WRITE REACHED"); };
      return coll;
    },
  };
  return fake;
}

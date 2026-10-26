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

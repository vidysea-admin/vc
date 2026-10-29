/**
 * Shared types for the vc-admin-control ingest side (spec S4). Pure data shapes: no I/O, no Mongo,
 * no dependency on the chat path. The stored artifacts (`source_artifacts.data`) are exactly a
 * SchemaMap or a NavCatalogue: schema and routes only, never row data (VA9a).
 */

export interface RepoFile {
  path: string;
  content: string;
}

export interface IngestDiagnostic {
  /** Machine-readable reason, e.g. "parse_error", "unknown_method", "unresolved_args". */
  code: string;
  /** The migration file (or path) the diagnostic is about. */
  file: string;
  message: string;
}

export interface SchemaColumn {
  type: string;
  allowNull?: boolean;
}

export interface SchemaTable {
  columns: Record<string, SchemaColumn>;
  /** Every migration that touched the table, in application (filename) order. */
  sourceFiles: string[];
}

export interface SchemaMap {
  tables: Record<string, SchemaTable>;
}

export interface MigrationParseResult extends SchemaMap {
  diagnostics: IngestDiagnostic[];
}

export interface NavRoute {
  /** URL path with route groups stripped, e.g. "/careers/[id]". */
  path: string;
  /** Route group(s) the page sat in, e.g. "(admin)"; nested groups are joined with "/". */
  group?: string;
  /** Optional trusted host lock snapshot. Missing means unknown, never proof that the UI is unlocked. */
  locked?: boolean;
  /** The page file the route came from. */
  file: string;
  /** Optional human name of the page (T-057: a platform service), read from the host's copy at sync time; never a URL. */
  label?: string;
  /** Optional one-line purpose of the page (T-057), read from the host's copy at sync time; never a URL. */
  summary?: string;
}

export interface NavCatalogue {
  routes: NavRoute[];
}

// ---------------------------------------------------------------------------------------------------------------------------------
// T8 (tf-t8-product-db-kg): the product + DB knowledge graph. Two halves, each stored beside its own source's artifact (`data.kg`),
// so a failed or empty sync of one source never touches the other. `joinProductKg` (routes.ts) resolves them by tool id.
// Schema, navigation and reviewed constants only: never row data.
// ---------------------------------------------------------------------------------------------------------------------------------

/** Where a node or edge came from: a file in the synced repo, optionally the line, and the blob sha of that file when the tree listing gave one. */
export interface KgProvenance {
  file: string;
  line?: number;
  /** Git blob sha of `file` at the synced tree. */
  blob?: string;
}

/** Repo identity of a synced half. `treeSha` / `commit` are set only when the GitHub port exposes them; `files` always lists the blob sha of every file read. */
export interface KgSource {
  owner: string;
  repo: string;
  branch: string;
  treeSha?: string;
  commit?: string;
  files: Record<string, string>;
}

/** A student-facing screen or tool. Mechanical fields come from the repo; `purpose`, `steps`, `auth` come from a reviewed seed (inventory) and are absent when no seed exists. */
export interface ProductTool {
  /** "section:<key>" for a hub section, "route:<path>" for a real page route. */
  id: string;
  kind: "section" | "route";
  /** Hub section key (STUDENT_SECTIONS), for kind "section". */
  key?: string;
  /** Base route: the hub path for a section, the page path for a route. A deep link is `route?section=key`. */
  route: string;
  label?: string;
  /** True when the sidebar lists the section. */
  sidebar?: boolean;
  /** Component rendered by the StudentOS switch for this section. */
  component?: string;
  purpose?: string;
  steps?: string[];
  auth?: "public" | "student";
  /** Where the mechanical facts were read (the switch case, the route file). */
  source: KgProvenance;
  /** Inventory row the reviewed fields were taken from (document:line text). */
  seed?: string;
}

export interface FrontendKg {
  version: 1;
  tools: ProductTool[];
  diagnostics: IngestDiagnostic[];
  source: KgSource;
}

export interface KgColumn {
  type: string;
  allowNull?: boolean;
  pk?: boolean;
  /** "table.column" this column references. */
  fk?: string;
  line: number;
}

/** A table read from a SQLAlchemy model class. `ownerKey` is the column that binds a row to a student/user, when one is recognisable. */
export interface ModelTable {
  className: string;
  file: string;
  line: number;
  columns: Record<string, KgColumn>;
  ownerKey?: string;
}

/** An HTTP handler found in a router file that constructs / updates / deletes a model of the listed tables (an over-approximation; informational). */
export interface ApiWriter {
  file: string;
  line: number;
  method: string;
  path: string;
  fn: string;
  tables: string[];
}

/** tool -writes-> table, taken from a reviewed seed and cross-checked against the parsed models and the router source. */
export interface ToolTableEdge {
  tool: string;
  table: string;
  rel: "writes";
  /** The BE file:line the inventory cites for the write. */
  seed: string;
  /** The table exists in the parsed models. */
  tableFound: boolean;
  /** A write to the table was verified in code: true only for verifiedBy "router" or "service". A model-only edge (the cited file just defines the table) is false (tf-fix-2). */
  writerFound: boolean;
  /** The cited file is the model file that defines the table (verifiedBy "model"): the table exists there, but no write was proven. Absent on artifacts stored before tf-fix-2. */
  definedInModel?: boolean;
  /**
   * How the edge was verified (kg-fix-1): "router" a handler (or helper) in the cited router file writes the model; "model" the cited file is the model
   * file that defines the table; "service" a bounded scan of the cited service file, or of a service the cited router imports (see `via`), finds a
   * write; "none" unverified (see `reason`). Absent on artifacts stored before kg-fix-1: those are read through writerFound.
   */
  verifiedBy?: EdgeVerifiedBy;
  /** Why verifiedBy is "none": table_not_in_models | table_defined_elsewhere | seed_file_not_read | service_not_read | no_write_in_seed_file. */
  reason?: string;
  /** The file whose scan proved a "service" edge. */
  via?: string;
}

export type EdgeVerifiedBy = "router" | "model" | "service" | "none";

/** VC -reads-> table: the tables the VC read port is allowed to select (the stored Postgres source's table list). */
export interface VcReadEdge {
  table: string;
  rel: "vc-reads";
  tableFound: boolean;
}

export interface BackendKg {
  version: 1;
  tables: Record<string, ModelTable>;
  writers: ApiWriter[];
  toolEdges: ToolTableEdge[];
  readEdges: VcReadEdge[];
  diagnostics: IngestDiagnostic[];
  source: KgSource;
}

/** The two halves resolved against each other by tool id. */
export interface ProductKg {
  tools: Array<ProductTool & { writes: Array<{ table: string; owner?: string; verified: boolean; definedInModel: boolean; verifiedBy: EdgeVerifiedBy; seed: string }> }>;
  tables: Record<string, ModelTable & { vcReads: boolean }>;
  danglingEdges: ToolTableEdge[];
}

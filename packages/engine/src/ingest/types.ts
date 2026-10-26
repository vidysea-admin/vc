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
  /** The page file the route came from. */
  file: string;
}

export interface NavCatalogue {
  routes: NavRoute[];
}
